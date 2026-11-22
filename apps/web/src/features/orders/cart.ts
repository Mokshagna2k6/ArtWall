import "server-only";

import { classifyCartRow, ISSUE_MESSAGES, type CartIssue } from "@/features/orders/cart-rules";
import { checkoutTotals, groupBySeller, type SellerGroup } from "@/features/orders/money";
import { getMarketplaceSettings, getOpenCommissionSplit } from "@/features/orders/settings";
import { canViewCollection } from "@/features/collections/policy";
import { pool } from "@/lib/db/index";

interface RawCartRow {
  artwork_id: string;
  curator_user_id: string | null;
  title: string | null;
  image: string | null;
  seller_id: string | null;
  seller_name: string | null;
  status: string | null;
  is_public: boolean | null;
  seller_published: boolean | null;
  price: number | null;
}

export interface CartLineView {
  artworkId: string;
  title: string;
  imageUrl: string | null;
  sellerId: string | null;
  sellerName: string | null;
  pricePaise: number | null;
  curatorUserId: string | null;
  /** Why this line cannot be bought right now, if it can't. */
  issue: CartIssue | null;
  issueMessage: string | null;
}

export interface CartView {
  lines: CartLineView[];
  /** Per-seller breakdown of the buyable lines only. */
  groups: SellerGroup[];
  totals: { subtotalPaise: number; shippingPaise: number; gstPaise: number; totalPaise: number };
  hasIssues: boolean;
  overLimit: boolean;
  maxOrderPaise: number;
}

/** The cart as the buyer sees it, priced and checked against the database right now. */
export async function loadCart(buyerId: string): Promise<CartView> {
  const { rows } = await pool.query<RawCartRow>(
    `select c.artwork_id, c.curator_user_id, a.title, a."imageUrl" as image, a."userId" as seller_id,
            p."displayName" as seller_name, a.status, a."isPublic" as is_public, p.published as seller_published, a.price_paise as price
     from cart_items c
     left join artworks a on a.id = c.artwork_id
     left join artist_profiles p on p."userId" = a."userId"
     where c.user_id = $1
     order by c.added_at`,
    [buyerId]
  );
  const lines: CartLineView[] = rows.map((r) => {
    const issue = classifyCartRow(
      {
        artworkId: r.artwork_id,
        artwork: r.seller_id
          ? { sellerId: r.seller_id, status: r.status ?? "", isPublic: Boolean(r.is_public), sellerPublished: Boolean(r.seller_published), pricePaise: r.price }
          : null,
      },
      buyerId
    );
    return {
      artworkId: r.artwork_id,
      title: r.title ?? "Removed work",
      imageUrl: r.image,
      sellerId: r.seller_id,
      sellerName: r.seller_name,
      pricePaise: r.price,
      curatorUserId: r.curator_user_id,
      issue,
      issueMessage: issue ? ISSUE_MESSAGES[issue] : null,
    };
  });

  const settings = await getMarketplaceSettings();
  const buyable = lines.filter((l) => !l.issue);
  let groups: SellerGroup[] = [];
  if (buyable.length > 0) {
    const policy = await getOpenCommissionSplit().catch(() => null);
    if (policy) {
      groups = groupBySeller(
        buyable.map((l) => ({ artworkId: l.artworkId, sellerId: l.sellerId!, unitPricePaise: l.pricePaise!, curatorUserId: l.curatorUserId })),
        policy.split,
        settings.flatShippingPaise
      );
    }
  }
  const totals = checkoutTotals(groups);
  return {
    lines,
    groups,
    totals,
    hasIssues: lines.some((l) => l.issue),
    overLimit: totals.totalPaise > settings.maxOrderPaise,
    maxOrderPaise: settings.maxOrderPaise,
  };
}

export interface AddResult {
  added: number;
  alreadyInCart: number;
  skipped: { artworkId: string; title: string; reason: string }[];
}

/**
 * Add works to a buyer's cart, skipping (and reporting) any that cannot be
 * bought. `curatorUserId` is only ever derived server-side from a public
 * curator collection, never accepted from the browser.
 */
export async function addArtworksToCart(
  buyerId: string,
  artworkIds: string[],
  attribution: { curatorUserId: string | null; collectionId: string | null } = { curatorUserId: null, collectionId: null }
): Promise<AddResult> {
  const result: AddResult = { added: 0, alreadyInCart: 0, skipped: [] };
  if (artworkIds.length === 0) return result;
  const { rows } = await pool.query<{
    id: string; title: string; seller_id: string; status: string; is_public: boolean; seller_published: boolean | null; price: number | null;
  }>(
    `select a.id, a.title, a."userId" as seller_id, a.status, a."isPublic" as is_public, p.published as seller_published, a.price_paise as price
     from artworks a left join artist_profiles p on p."userId" = a."userId" where a.id = any($1::text[])`,
    [artworkIds]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const artworkId of artworkIds) {
    const r = byId.get(artworkId);
    const issue = classifyCartRow(
      {
        artworkId,
        artwork: r ? { sellerId: r.seller_id, status: r.status, isPublic: r.is_public, sellerPublished: Boolean(r.seller_published), pricePaise: r.price } : null,
      },
      buyerId
    );
    if (issue) {
      result.skipped.push({ artworkId, title: r?.title ?? "Unknown work", reason: ISSUE_MESSAGES[issue] });
      continue;
    }
    const ins = await pool.query(
      `insert into cart_items (user_id, artwork_id, curator_user_id, source_collection_id) values ($1, $2, $3, $4)
       on conflict (user_id, artwork_id) do nothing`,
      [buyerId, artworkId, attribution.curatorUserId, attribution.collectionId]
    );
    if (ins.rowCount) result.added += 1;
    else result.alreadyInCart += 1;
  }
  return result;
}

/** Everything in a collection the viewer is allowed to see, with the curator to credit (public curator collections only). */
export async function resolveCollectionForCart(
  collectionId: string,
  buyerId: string
): Promise<{ artworkIds: string[]; attribution: { curatorUserId: string | null; collectionId: string } } | null> {
  const { rows } = await pool.query<{ owner_id: string; type: string; visibility: "public" | "private"; curator_active: boolean }>(
    `select c.owner_id, c.type, c.visibility,
            exists (select 1 from curators k where k.user_id = c.owner_id and k.status = 'active') as curator_active
     from collections c where c.id = $1`,
    [collectionId]
  );
  const c = rows[0];
  if (!c || !canViewCollection({ visibility: c.visibility, actorId: buyerId, ownerId: c.owner_id }).allow) return null;
  const items = await pool.query<{ artwork_id: string }>(
    `select artwork_id from collection_artworks where collection_id = $1 order by position, added_at`,
    [collectionId]
  );
  const credited = c.type === "CURATOR" && c.visibility === "public" && c.curator_active;
  return {
    artworkIds: items.rows.map((r) => r.artwork_id),
    attribution: { curatorUserId: credited ? c.owner_id : null, collectionId },
  };
}
