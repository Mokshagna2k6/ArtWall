"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Share2 } from "lucide-react";

import { ArtWallLogo } from "@/components/brand/artwall-logo";
import { siteConfig } from "@/config/site";
import { duration, transition } from "@/lib/motion";

interface FounderCertificateProps {
  name: string;
  number: number;
}

/**
 * What an artist receives instead of "thanks, we'll be in touch."
 *
 * The distinction that matters: a confirmation message is something you read
 * once and close, while a numbered certificate is something you *have*. Phase 1
 * is explicit that pride is one of only two reliable sharing triggers, and
 * pride needs an object.
 *
 * The seal animates in as a stamp - the one place in the system where a
 * ceremony is warranted, because it is the moment the artist actually becomes a
 * founding member.
 *
 * Share behaviour degrades in three tiers: the native share sheet on mobile,
 * clipboard on desktop, and - if both are unavailable or blocked - the link
 * stays visible on the certificate itself so it can always be copied by hand.
 */
export function FounderCertificate({ name, number }: FounderCertificateProps) {
  const [copied, setCopied] = useState(false);

  const shareText = `I'm Founding Artist #${number} on ArtWall, India's home for artists. Art lives on the wall.`;

  async function share() {
    const data = { title: "ArtWall", text: shareText, url: siteConfig.url };

    try {
      if (navigator.share && navigator.canShare?.(data)) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(`${shareText} ${siteConfig.url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // User dismissed the sheet, or the page lacks clipboard permission.
      // Nothing to recover from - the URL is printed on the certificate.
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.slow}
      role="status"
      aria-live="polite"
      className="flex flex-col gap-6"
    >
      <div className="border-ember/40 relative overflow-hidden rounded-xl border p-8 text-center sm:p-10">
        {/* Warmth behind the seal */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 50% at 50% 0%, rgb(232 163 61 / 0.14), transparent 70%)",
          }}
        />

        <div className="relative flex flex-col items-center gap-5">
          <motion.span
            aria-hidden
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: duration.slow, ease: [0.22, 1, 0.36, 1] }}
            className="bg-ember flex size-14 items-center justify-center rounded-full text-white"
            style={{ boxShadow: "0 0 36px rgb(232 163 61 / 0.55)" }}
          >
            <ArtWallLogo className="size-7" />
          </motion.span>

          <p className="text-ember text-label tracking-[0.18em] uppercase">
            Your place is held
          </p>

          <p className="font-heading text-display-s tracking-tight tabular-nums">
            #{number}
          </p>

          <div>
            <p className="font-heading text-h4 tracking-tight">{name}</p>
            <p className="text-muted-foreground text-small mt-1">
              Founding Artist &middot; {siteConfig.legalName}
            </p>
          </div>

          <p className="text-muted-foreground text-body max-w-md text-balance">
            That number is yours permanently. We&rsquo;ll write to you before
            anyone else gets in, and your frame is already on the wall.
          </p>

          <p className="text-muted-foreground border-border text-caption mt-2 w-full border-t pt-5">
            {siteConfig.url.replace(/^https?:\/\//, "")}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={share}
        className="border-border text-foreground hover:border-ember/50 hover:bg-ember/5 text-body inline-flex h-12 items-center justify-center gap-2 rounded-md border transition-colors"
      >
        {copied ? (
          <>
            <Check className="size-4" aria-hidden />
            Copied to clipboard
          </>
        ) : (
          <>
            <Share2 className="size-4" aria-hidden />
            Share this
          </>
        )}
      </button>
    </motion.div>
  );
}
