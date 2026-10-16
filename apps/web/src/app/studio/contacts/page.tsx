import { getContacts } from "@/app/actions/contacts";
import {
  StudioEmptyState,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";
import { WorkspaceCreateForm } from "@/components/dashboard/workspace-create-form";
import { getMyInquiries } from "@/features/inquiries/actions";
import { InquiryInbox } from "@/features/inquiries/inquiry-inbox";

export default async function ContactsPage() {
  const [contacts, inquiries] = await Promise.all([getContacts(), getMyInquiries()]);
  const unread = inquiries.filter((thread) => thread.unread).length;

  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Network"
        title="Contacts"
        description="Conversations about your work, and the record of collectors, curators, galleries and collaborators behind them."
        action={<WorkspaceCreateForm kind="contact" />}
      />

      <section aria-label="Inquiries" className="studio-card p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="studio-eyebrow">Inquiries</p>
            <h2 className="text-studio-ink text-subsection mt-2">
              {inquiries.length === 0 ? "No conversations yet" : "Conversations"}
            </h2>
          </div>
          {unread > 0 && (
            <p className="text-studio-muted text-sm">
              <span className="text-studio-ink font-medium">{unread}</span> unread
            </p>
          )}
        </div>
        <div className="mt-5">
          <InquiryInbox threads={inquiries} />
        </div>
      </section>

      <section aria-label="Contact book">
        <p className="studio-eyebrow">Contact book</p>
        <div className="mt-4">
          {contacts.length === 0 ? (
            <div className="studio-card">
              <StudioEmptyState
                title="Your collector book is empty"
                description="Contacts are added automatically when someone inquires about your work, and you can add them by hand too."
              />
            </div>
          ) : (
            <div className="studio-card overflow-hidden">
              <div className="divide-studio-border flex flex-col divide-y">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between gap-4 p-5"
                  >
                    <div>
                      <p className="text-studio-ink font-medium">{contact.name}</p>
                      <p className="text-studio-muted mt-1 text-sm">
                        {/* A contact created by an inquiry deliberately has no
                            email: the platform relays (Bible §A13). */}
                        {contact.email ??
                          (contact.sourceInquiryId
                            ? "Reachable through the conversation above"
                            : "No email")}
                      </p>
                    </div>
                    <span className="studio-eyebrow">{contact.kind}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
