import { z } from "zod";

/** Shipping address. India only in v1 (plan Q15); validated on the server, never trusted from the form. */
export const addressSchema = z.object({
  name: z.string({ error: "Enter the recipient's name." }).trim().min(2, "Enter the recipient's name.").max(120),
  phone: z
    .string({ error: "Enter a 10-digit mobile number." })
    .trim()
    .regex(/^(?:\+91|91|0)?[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number."),
  line1: z.string({ error: "Enter the street address." }).trim().min(3, "Enter the street address.").max(200),
  line2: z.string().trim().max(200).optional().default(""),
  city: z.string({ error: "Enter the city." }).trim().min(2, "Enter the city.").max(80),
  state: z.string({ error: "Enter the state." }).trim().min(2, "Enter the state.").max(80),
  pincode: z.string({ error: "Enter a 6-digit PIN code." }).trim().regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code."),
});
export type Address = z.infer<typeof addressSchema>;

/** Last 10 digits, so `+91 98765 43210` and `9876543210` compare equal. */
export function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}
