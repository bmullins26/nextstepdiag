# Email Users Directly From the Owner Console

Add a compose-and-send email flow inside NextStep so you can reach out to a
user, a beta applicant, or a feedback submitter without leaving the app.

## What you get

**1. Compose dialog (free-form)**
- "Email" button on: the Users table rows, each Beta applicant row, and each
  Feedback / bug report row.
- Dialog pre-fills the recipient (name + address, read-only) and lets you type
  a subject and message. Plain text with line breaks; no HTML pasting.
- Sends through your verified sender (notify.nextstepdiag.com) wrapped in a
  branded NextStep template that matches the app's black/white styling.
- Optional "Reply-to" defaults to your owner address so replies land in your
  inbox.

**2. A dedicated Compose page**
- `/owner/emails` gains two tabs: **Compose** and **Exports** (the existing
  segment/CSV export tool stays exactly as-is).
- Compose lets you pick a recipient by searching users/applicants, or type any
  address manually.

**3. Sent history**
- Every send is logged (recipient, subject, status, timestamp, who sent it) and
  shown as a "Sent" list on the Emails page, so you can see what went out and
  whether delivery failed.
- Bounced/unsubscribed addresses are blocked automatically and shown as
  suppressed instead of silently failing.

## About mass announcements

Lovable's built-in email system is designed for one-to-one app email. Blasting
the same announcement to your whole user list is a marketing/newsletter send,
which it does not support — doing it anyway risks your sender domain's
deliverability and can get the domain flagged.

So this plan covers direct one-to-one outreach in-app, and for announcements
keeps the existing segment CSV export, which you can drop into a mailing tool
(Mailchimp, Brevo, Loops, etc.). If you want, I can wire up a marketing
provider connector as a follow-up so announcements are also sendable from the
owner console — say the word and I'll plan that separately.

## Technical notes

- Run email infrastructure scaffolding for app (transactional) email: creates
  the send/preview/unsubscribe routes and the template registry under
  `src/lib/email-templates/`. Auth email infra and the queue route already
  exist.
- New template `owner-message.tsx`: NextStep header, greeting, message body
  rendered from `templateData` (escaped, never raw HTML), signature.
- New `src/lib/owner-outreach.functions.ts`:
  - `sendOwnerEmail` — owner-gated, Zod-validated (`to` email, subject <=150,
    body <=5000), suppression check, one recipient per call, idempotency key
    derived from a generated message id; posts to the transactional send route.
  - `listOwnerEmails` — recent sends read from `email_send_log` filtered to the
    owner-message template, deduped by `message_id`.
- New `src/components/owner/email-compose-dialog.tsx` — shared dialog reused by
  the Users, Beta, and Feedback tables plus the Compose page.
- Wire the "Email" button into `src/components/owner-panels.tsx` (users +
  feedback), the beta program tab, and `src/routes/_authenticated/owner/emails.tsx`.
- No schema migration needed; `email_send_log` and `suppressed_emails` already
  exist.
