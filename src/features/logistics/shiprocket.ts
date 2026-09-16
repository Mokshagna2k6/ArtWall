import "server-only";

/**
 * Shiprocket integration stub.
 * All functions no-op if SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD not set.
 *
 * ponytail: plain fetch against Shiprocket REST API.
 * No SDK needed — their API is simple JSON.
 */

const BASE = "https://apiv2.shiprocket.in/v1/external";

async function getToken(): Promise<string | null> {
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) return null;

  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { token?: string };
  return data.token ?? null;
}

export interface ShippingRate {
  courier: string;
  rate: number;
  estimatedDays: number;
}

export async function getShippingRates(input: {
  pickupPincode: string;
  deliveryPincode: string;
  weightKg: number;
}): Promise<ShippingRate[]> {
  const token = await getToken();
  if (!token) return [];

  const res = await fetch(
    `${BASE}/courier/serviceability/?pickup_postcode=${input.pickupPincode}&delivery_postcode=${input.deliveryPincode}&weight=${input.weightKg}&cod=0`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];

  const data = (await res.json()) as {
    data?: { available_courier_companies?: Array<{
      courier_name: string;
      rate: number;
      estimated_delivery_days: number;
    }> };
  };

  return (data.data?.available_courier_companies ?? []).map((c) => ({
    courier: c.courier_name,
    rate: c.rate,
    estimatedDays: c.estimated_delivery_days,
  }));
}

export async function createShipment(input: {
  orderId: string;
  buyerName: string;
  buyerPhone: string;
  buyerAddress: string;
  buyerCity: string;
  buyerState: string;
  buyerPincode: string;
  productName: string;
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  valuePaise: number;
}): Promise<{ shipmentId?: string; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Shiprocket not configured" };

  const res = await fetch(`${BASE}/orders/create/adhoc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      order_id: input.orderId,
      order_date: new Date().toISOString().slice(0, 10),
      billing_customer_name: input.buyerName,
      billing_phone: input.buyerPhone,
      billing_address: input.buyerAddress,
      billing_city: input.buyerCity,
      billing_state: input.buyerState,
      billing_pincode: input.buyerPincode,
      billing_country: "India",
      shipping_is_billing: true,
      order_items: [
        {
          name: input.productName,
          sku: input.orderId,
          units: 1,
          selling_price: (input.valuePaise / 100).toFixed(2),
        },
      ],
      payment_method: "Prepaid",
      sub_total: (input.valuePaise / 100).toFixed(2),
      weight: input.weightKg,
      length: input.lengthCm,
      breadth: input.breadthCm,
      height: input.heightCm,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[shiprocket] Order creation failed:", res.status, text);
    return { error: `Shiprocket error: ${res.status}` };
  }

  const data = (await res.json()) as { shipment_id?: number };
  return { shipmentId: data.shipment_id?.toString() };
}
