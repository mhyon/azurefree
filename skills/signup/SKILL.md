---
name: signup
description: Walks someone through getting an Azure account that can use the free tier. Options are the Azure free account (USD 200 credit for 30 days, 12 months of free services, plus always-free services), Azure for Students (no card), or an existing subscription. Use when the user has no Azure account yet, asks how to sign up for Azure or its free trial, asks what the free account includes or what happens after 30 days, or asks about Azure for Students.
---

# Get an Azure account for free-tier use

You can't sign up on the user's behalf, and you mustn't try. Never type card numbers, phone codes, passwords or one-time codes, and never solve CAPTCHAs. Your job is to:
- help them pick the right kind of account
- explain the deal in plain words
- open the page for them
- coach them through each screen

Check eligibility and terms against [free-offers.md](${CLAUDE_PLUGIN_ROOT}/reference/free-offers.md) §1. Re-verify anything marked *unverified* before stating it as fact.

## 1. Which situation are they in?

Ask with AskUserQuestion (or in plain text if that tool isn't available):

**"Which fits you best?"**
- **New to Azure and I have a credit or debit card (recommended).** Go to the free account path.
- **I'm a student with a school email.** Go to the Azure for Students path.
- **I already have an Azure account.** Go to the existing account path.
- **No card and not a student.** Go to the no-card path.

## 2. Explain the deal for that path (10 lines or fewer)

### Free account
- **Day 0 to 30:** USD 200 credit and the spending limit is **on**, so your card can't be charged. You get every always-free service, plus 12 months of extra free services such as a PostgreSQL or MySQL server.
- **The card is only for identity.** A temporary $1 hold appears and then drops off. Prepaid cards aren't accepted.
- **Day 30, or when the credit runs out, you decide:**
  - **Upgrade to pay-as-you-go** to keep the free services. Always-free services stay $0 within their limits, and the 12-month ones continue. Upgrading **removes the spending limit for good**, which is why setup creates a $1 budget email alert.
  - **Don't upgrade**, and the subscription is disabled. Your apps stop.
- **One free account per person.** The 12-month services are only for people who've never had an Azure account.

### Azure for Students
- USD 100 credit for 12 months. **No card needed.**
- Requirements: age 18+, full-time student, verified with a school email.
- Renew every year while you're a student.
- Same free services as the free account.
- For education and non-commercial projects only.
- Budgets (cost alerts) don't work on this offer, so the credit itself is the safety net. Check the balance at https://www.microsoftazuresponsorships.com.

### Existing account
- Nothing to sign up for. The always-free services work on any pay-as-you-go subscription:
  - Static Web Apps Free
  - App Service F1
  - Container Apps and Functions grants
  - Azure SQL free offer
  - Cosmos DB free tier
- The 12-month extras only exist if this subscription came from a free account in the last 12 months.
- If the account is through work or school, suggest a personal subscription for personal projects.
- Go straight to step 6.

### No card and not a student
Be honest:
- Azure's free account needs a card to verify identity. The spending limit means it won't be charged during the trial.
- **Students aged 13+** can try Azure for Students Starter. It's limited to App Service and Functions, with no free database.
- Otherwise they'll need a card. Give them the facts and let them decide. Don't push.

## 3. What to have ready

- A Microsoft account or a GitHub account. They can also create a Microsoft account during sign-up with any email address. A personal account is better than a work account.
- A phone that can receive a text or call.
- **Free account only:** a credit or debit card (not prepaid). In Hong Kong and Brazil, credit cards only.
- About 10 minutes.

## 4. Open the sign-up page

| Path | URL |
|---|---|
| Free account | https://go.microsoft.com/fwlink/?linkid=2227353 (overview: https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account) |
| Students | https://azure.microsoft.com/en-us/free/students/ |
| Pay-as-you-go, with no free credit | https://go.microsoft.com/fwlink/?linkid=2234155 |

Offer to open it in their default browser. Use the command for their shell:

| Shell | Command |
|---|---|
| PowerShell | `Start-Process "<url>"` |
| Git Bash | `start "" "<url>"` |
| macOS | `open "<url>"` |
| Linux | `xdg-open "<url>"` |

## 5. Coach them through the screens

Walk them through these screens. They type everything themselves.

1. **Sign in** with, or create, a Microsoft or GitHub account.
2. **About you:** country, name, email, phone. The country can't be changed later.
3. **Identity by phone:** a text or call with a code.
4. **Identity by card** (free account only).
5. **Agreement:** tick the box and sign up. Then they land on the Azure portal.

Common snags:
- **Card declined.** Try another card. Virtual and prepaid cards often fail. The bank may need to approve the $1 hold through a 3-D Secure prompt.
- **"Not eligible for the free account."** They've had one before. They can sign up for pay-as-you-go instead, and the always-free services still apply.
- **Phone code not arriving.** Wait a minute, then use the call option.
- **Lands in a work directory.** They signed in with a work account. Sign out and use a personal one.

## 6. Confirm and hand off

Ask: **"How did it go?"**
- **Done: I'm in the Azure portal.** Load `azure-free:setup`. Signing in from the CLI there confirms the account and detects the offer type.
- **Stuck on a step.** Ask which screen, then help using the snags above. If it's a billing or identity problem only Microsoft can fix, point them to https://azure.microsoft.com/support/create-ticket (free billing support).
- **I'll do it later.** Explain that when they come back, `/azure-free:start` picks up from here.
