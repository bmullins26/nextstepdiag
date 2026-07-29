# Next Step Diagnostics 

BUILD NEXTSTEP DIAGNOSTICS LITE

Product Name

NextStep Diagnostics

Tagline

A Technician In Your Pocket

IMPORTANT

Build this as a professional appliance technician diagnostic platform.

DO NOT build a chatbot.

DO NOT build a generic AI assistant.

DO NOT build a consumer troubleshooting application.

This application is designed specifically for appliance technicians.

The primary goal is to answer:

"What should I test next?"

BRANDING

Use the uploaded NextStep Diagnostics logo.

The logo should be prominently displayed throughout the application.

Apply the branding consistently across all screens.

COLOR PALETTE

Primary Background: #102B44

Secondary Background: #1A1F2E

Primary Accent: #1FC7C7

Secondary Accent: #F57C28

Primary Text: #FFFFFF

Secondary Text: #D1D5DB

DESIGN STYLE

Use the visual style of the original homepage design.

The logo and mascot should be a major visual element.

Avoid generic SaaS layouts.

Avoid generic AI chatbot layouts.

The application should feel like premium field-service software.

Dark theme.

Mobile first.

Large buttons.

Easy one-handed operation.

HOMEPAGE

Display:

Large NextStep Diagnostics Logo

Tagline: A Technician In Your Pocket

Headline:

Don't Guess.

Know Your Next Step.

Button:

Start Diagnosis

APPLICATION FLOW

Keep the workflow simple.

No subscriptions.

No billing.

No age finder.

No repairability score.

No customer explanation generator.

No feature gating.

Focus only on diagnostics.

STEP 1

APPLIANCE VERIFICATION

Fields:

Brand

Model Number

Serial Number

Button:

Verify Appliance

Display:

Manufacturer

Appliance Type

Model Number

Serial Number

Confidence Level

If appliance type cannot be identified, ask the technician for clarification.

Do not guess.

STEP 2

CUSTOMER COMPLAINT

Allow technicians to describe the issue in their own words.

Provide:

Text Input

Voice Input

Examples:

"Washer fills and drains but will not spin."

"Refrigerator freezer is cold but fresh food section is warm."

"Dryer tumbles but does not heat."

Button:

Start Diagnosis

STEP 3

GUIDED DIAGNOSTIC ENGINE

This is the core feature.

The system should act like a senior appliance technician.

Ask ONE question at a time.

Never provide a large troubleshooting article.

Never provide all diagnostic steps at once.

Each answer should determine the next question.

Example:

Question: Is water remaining in the basket?

User: Yes

Question: Can the drain pump be heard running?

User: No

Question: Is voltage present at the drain pump?

User: Yes

Result: Most Likely Failure: Drain Pump

Recommended Next Test: Verify amp draw of drain pump.

DIAGNOSTIC SCREEN

Always display:

Verified Appliance

Customer Complaint

Current Findings

Questions Answered

Most Likely Failure

Recommended Next Test

DOCUMENT ASSISTANT

Place a small optional button:

Upload Tech Sheet or Wiring Diagram

This is optional.

Diagnostics must work even if no document is uploaded.

If a document is uploaded:

Use it to improve troubleshooting.

Allow follow-up questions about the document.

MOST IMPORTANT RULE

The application should feel like a senior appliance technician standing beside a junior technician during a service call.

Every screen should help answer:

"What is the next step?"

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://nextstepdiag.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a3786821-6f1a-4d3b-9c2b-bf174637d4b3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
