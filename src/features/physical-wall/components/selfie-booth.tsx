"use client";

import { useActionState, useState, useRef } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { submitUgc } from "@/features/physical-wall/actions/ugc";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";

export function SelfieBooth({ visitId }: { visitId?: string }) {
  const [state, formAction] = useActionState(submitUgc, IDLE);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cloudinaryId, setCloudinaryId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submitted = state.status === "ok";

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setPreview(null);
    setCloudinaryId(null);

    try {
      const sigRes = await fetch("/api/physical-wall/ugc/upload-signature", {
        method: "POST",
      });
      const sigData = await sigRes.json();
      if (!sigData.ok || !sigData.signature) {
        throw new Error(sigData.message || "Could not get upload signature.");
      }

      const { signature, timestamp, apiKey, cloudName, folder } = sigData.signature;

      const form = new FormData();
      form.append("file", file);
      form.append("api_key", apiKey);
      form.append("timestamp", String(timestamp));
      form.append("folder", folder);
      form.append("signature", signature);

      const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
        request.timeout = 120_000;

        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        request.addEventListener("load", () => {
          if (request.status < 200 || request.status >= 300) {
            reject(new Error("Upload rejected."));
            return;
          }
          try {
            resolve(JSON.parse(request.responseText));
          } catch {
            reject(new Error("Could not read upload response."));
          }
        });

        request.addEventListener("error", () => reject(new Error("Upload failed.")));
        request.addEventListener("timeout", () => reject(new Error("Upload timed out.")));

        request.send(form);
      });

      setCloudinaryId(result.public_id);
      setPreview(result.secure_url);
    } catch (err) {
      console.error("[selfie-booth] upload", err);
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border-hairline rounded-md border p-6">
      <h3 className="font-heading text-card">Selfie with the wall</h3>
      <p className="text-ink-muted mt-2 text-sm leading-6">
        Take a photo with the exhibition and share it to the community gallery.
        Your face stays yours — we only keep the photo as long as you leave it
        public.
      </p>

      {submitted ? (
        <div className="mt-5 rounded-md border border-signal/40 bg-signal/[0.06] p-4 text-sm leading-6">
          <p className="font-medium text-signal">Submitted for moderation</p>
          <p className="text-ink-muted mt-1">
            We&rsquo;ll let you know when it&rsquo;s live. You can withdraw it
            any time — just ask and it&rsquo;ll be deleted and purged.
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-5 flex flex-col gap-5">
          <input type="hidden" name="visitId" value={visitId ?? ""} />
          <input type="hidden" name="cloudinaryId" value={cloudinaryId ?? ""} />
          {preview && (
            <input type="hidden" name="imageUrl" value={preview} />
          )}

          <Field label="Photo" htmlFor="ugc-photo">
            <input
              id="ugc-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/gif"
              required
              ref={fileRef}
              onChange={onFileChange}
              className="text-sm"
            />
            {uploading && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full bg-ink transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            {preview && (
              <div className="mt-2 overflow-hidden rounded-md border">
                <img
                  src={preview}
                  alt="Preview"
                  className="h-48 w-full object-cover"
                />
              </div>
            )}
          </Field>

          <Field label="Caption (optional)" htmlFor="caption">
            <textarea
              id="caption"
              name="caption"
              rows={2}
              maxLength={500}
              placeholder="Sunday art walk"
              className={`${inputClass} h-auto resize-y py-2.5`}
            />
          </Field>

          <div className="border-hairline flex flex-col gap-4 rounded-md border p-4">
            <label className="flex cursor-pointer gap-3 text-sm leading-6">
              <input
                type="checkbox"
                name="consent"
                required
                className="mt-1 size-4 shrink-0"
              />
              <span>
                I give explicit, informed consent for this photo to be displayed
                publicly. I can withdraw any time — the image will then be
                deleted and purged from the CDN.
              </span>
            </label>

            <label className="flex cursor-pointer gap-3 text-sm leading-6">
              <input
                type="checkbox"
                name="adultConfirmed"
                required
                className="mt-1 size-4 shrink-0"
              />
              <span>
                Everyone in this photo is 18+. (Minors require verifiable
                parental consent — DPDP.)
              </span>
            </label>
          </div>

          <SubmitButton disabled={!cloudinaryId || uploading}>
            {uploading ? "Uploading…" : "Submit for moderation"}
          </SubmitButton>
          <FormStatus state={state} />
        </form>
      )}
    </div>
  );
}
