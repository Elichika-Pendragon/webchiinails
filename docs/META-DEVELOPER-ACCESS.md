# Meta developer access: SMS, redirects and disabled app creation

Research checked 20 October 2026. This is a troubleshooting record, not a verified workaround. No account settings, phone numbers, payment methods, permissions or website runtime were changed during this investigation.

## Current Chii evidence

- The owner confirms the Facebook login is Jessica's and is connected to Chii's Instagram. Keep this identity; do not switch to Audrey's personal account.
- The connected Chrome session shows the Nail Art Palembang business portfolio and full business access.
- Earlier in this investigation, visiting the developer Apps URL redirected the session to Business Suite's advertising-app settings. In the fresh check after the owner logged in to Facebook, `/apps` instead redirected to the developer homepage. Neither redirect is proof that no developer app exists elsewhere.
- Portfolio Settings → Accounts → Apps shows no apps added. Its Add dialog has **Create new app ID disabled**; connecting/requesting an existing app ID remains available. The dialog gives no visible reason. [Screenshot](evidence/meta-app-create-disabled-2026-10-20.png).
- The user's earlier SMS screenshot explicitly displays a frequency/anti-spam restriction. Its expiry is not stated. No resend was clicked and no number was changed during the latest check; the registration page showed a send/wait countdown, and the owner subsequently reported that **no SMS arrived**.
- A prior direct visit to Facebook Accounts Center requested a fresh Facebook login, although Business Suite remained accessible. The owner has now completed that login; the latest Accounts Center and registration observations are recorded below. The earlier login prompt did not prove the redirect's cause.
- Instagram API authorization and the production token/renewal deployment remain unfinished. Current curated website photos continue to work.

The latest registration screen explicitly shows **Verify account incomplete**, so developer registration is not finished. Whether that incomplete stage is the precise cause of the disabled Business Suite control remains an inference, not a diagnosis from Jessica's disabled-control tooltip. The redirect changed after the fresh login, but its underlying cause is not established.

## Latest account and registration check — 20 October 2026

- The owner logged in to Jessica's Facebook account. Accounts Center shows her Facebook profile and `chii.nails_` linked.
- Details for the previously used phone and the default email show management controls, including visibility/deletion, with **no pending-confirmation warning or Confirm button visible**. This is an absence of pending UI, not an explicit certification that either contact satisfies developer verification. No contact value was changed or deleted.
- Visiting developer `/apps` now leads to the developer homepage. Selecting **Get Started** reaches `/async/registration/dialog/?src=default`.
- A fresh Business Suite Apps → Add recheck after this login still shows Create new app ID disabled.
- The registration progress shows **Register complete**, **Verify account incomplete**, and **Contact info** / **About you** pending. Reaching this screen is not completed developer registration or API access.
- The current SMS code-entry screen targets a **different existing listed number, ending in 9096**, rather than the previously used number. Only that suffix is retained here. The screen showed an SMS send/wait countdown; it does not establish that the message reached the phone. No resend was clicked and no number was changed.
- No email or WhatsApp verification alternative was shown on this screen.
- The owner reported that **no SMS arrived** for the listed number. No developer app or Instagram API access/token has been obtained in this check. The website runtime remains unchanged.

## Most relevant original Reddit reports

These are first-hand accounts and replies, not independently reproduced fixes. Posts about ordinary login, WhatsApp-number onboarding, advertising assets and Quest/VR are different workflows. Repeated cross-posts are not independent evidence.

| Report | What it establishes | Limits / outcome |
| --- | --- | --- |
| [Disabled Create new app ID](https://www.reddit.com/r/FacebookAds/comments/1mr8v2q/fix_meta_facebook_account_confirmation_issue_for/) (15 Aug 2025) | Exact menu matches Chii. The poster's hover text requires personal-account confirmation by mobile/card, then sends them to developer registration. | Their next failure is a device-trust restriction. No posted resolution; replies continue in 2026. Does not explicitly establish the poster's full-control role. |
| [Indonesia: Facebook OTP works, developer SMS does not](https://www.reddit.com/r/facebook/comments/1smxbfk/unable_to_receive_verification_code_when_signing/) (16 Apr 2026) | Account Center/2FA SMS works while developer registration SMS fails. | No successful fix reported. OP says Meta Pay is unavailable locally; that is an individual report, not verified current regional policy. No reliable Telkomsel/Indosat/XL-specific fix found. |
| [Developer portal redirects; Incognito reaches app settings](https://www.reddit.com/r/WhatsappBusinessAPI/comments/1xa7ejb/whatsapp_cloud_api_experience_is_an_absolute/) (19 Oct 2026) | Direct first-hand example of normal-profile developer → business overview redirection, avoided in an isolated session. | Existing app, another country. Their separate OTP issue concerns WhatsApp production-number setup. Does not prove Jessica's exact redirect has the same cause. |
| [Email confirmation resolves registration for several users](https://www.reddit.com/r/facebook/comments/1h3usyf/not_able_to_make_a_facebook_developer_account/) | OP and several replies report success after connecting/confirming the registration email in personal Facebook Accounts Center. | Original failure is email confirmation. Other replies still fail with confirmed contacts or device-trust warnings; not a universal SMS fix. |
| [Large missing-SMS discussion](https://www.reddit.com/r/facebook/comments/1dp0ry1/i_cant_get_an_sms_code_to_verify_for_meta/) (26 Jun 2024; later replies) | Reported successes include clearing pending phone confirmation, reopening registration, and adding Meta Pay shipping/contact information. | Others report failure. Business-first claims often bundle payment/contact changes, preventing attribution to portfolio creation alone. |
| [Browser changes and card anecdotes](https://www.reddit.com/r/facebook/comments/1rfjebb/cant_create_a_meta_developer_account_due_to_sms/) (26 Feb 2026; later replies) | One commenter reports Safari → Chrome success without adding a payment method; another reports Chrome → Edge success. | Other users say browser/number changes failed. Many card-related successes, but these remain anecdotes. No established engine-specific cause. |
| [Contact-only Meta Pay failed, card plus cache later succeeded](https://www.reddit.com/r/facebook/comments/1lqui7p/i_have_every_fricking_approach_but_i_am_just_not/) (Jul 2025) | OP explicitly distinguishes failed contact-info setup from their later successful card/cache combination. | Does not prove the card alone caused success; no guarantee of regional availability, acceptance or absence of a hold. |
| [Facebook number confirmed, developer SMS absent](https://www.reddit.com/r/MetaAppDevelopers/comments/1rcvcqc/not_receiving_sms_verification_code_for_meta_for/) (23 Feb 2026) | Normal Facebook phone confirmation can succeed while developer SMS still fails. | Waiting days, browser changes and number removal/readdition did not resolve it. No posted solution. |
| [OTP accepted, final registration loops](https://www.reddit.com/r/facebook/comments/1w4hjrk/unable_to_create_meta_for_developers_account/) (Sep 2026) | Confirmed contacts, professional Instagram/Page and normal/Incognito browsers can coexist with a broken registration flow. | Different stage from missing SMS. OP later says resolved without a method; others remain stuck. Receiving a code is not proof of completed registration. |
| [Missing SMS then blank semicolon page](https://www.reddit.com/r/facebook/comments/1roynd9/meta_developer_registration_bug_white_screen_with/) (9 Mar 2026) | Repeated resends were followed by a broken registration page; browser changes did not help OP. | Rate limiting is a hypothesis in that post, not a confirmed cause or reset timer. |
| [Developer SMS rate-limit report](https://www.reddit.com/r/facebook/comments/17witzd/sms_verification_for_facebook_developer_account/) (2023; later replies) | Same broad sequence of absent SMS, repeated requests and restriction. | Next-day retry still failed for OP. Contact/card suggestions do not establish a reliable cooldown. |
| [Missing SMS in step two](https://www.reddit.com/r/facebook/comments/1mi5sn4/i_cannot_register_my_facebook_developers_wont/) (2025) | Number-format experimentation did not solve the reporter's missing SMS. | No posted successful resolution. Do not assume Chii's number is wrong from this symptom. |

Adjacent examples: [Business app creation and developer My Apps both error](https://www.reddit.com/r/FacebookAds/comments/1mhqoqt/) and [Business → Create App ID redirects to developer error](https://www.reddit.com/r/FacebookAds/comments/1rpvbdn/unable_to_create_app_id_in_facebook_developer/). Neither demonstrates a fix for the disabled button.

## Ranked free troubleshooting sequence

1. **Inspect the exact disabled-control explanation if available.** A confirmation requirement, business restriction and permission error need different responses. Full business control alone does not identify which applies. The current captured dialog has no visible explanation; its hover text has not been obtained.
2. **Inspect existing contact confirmation.** On Jessica's personal Facebook profile: Accounts Center → Personal details → Contact info. The latest check found no pending-confirmation warning or Confirm button on the previously used phone/default email details; this is not explicit developer-verification certification. If Meta later presents a required confirmation or contact change, Jessica completes it herself. Record status without copying private values into public documentation. Do not delete/re-add contacts or weaken 2FA as an experiment.
3. **Reopen developer registration once after any completed confirmation.** Merely reopening may update stale status; do not automatically request another SMS. Success means reaching the developer dashboard and being able to create/manage the app, not just accepting an OTP.
4. **Test session isolation.** Use Jessica's same existing identity in an isolated browser session. Preserve the working session and its cookies. If this removes the redirect but registration still demands SMS, record those as separate outcomes. A fresh session can also trigger device-trust checks; if so, return to Jessica's familiar device rather than repeatedly switching.
5. **Optional, low-confidence contact-only Meta Pay lead.** Some users report success after adding matching phone/email under Shipping/Contact Info; others explicitly report failure. Availability for this Indonesian account has not been checked. No card or financial setup is authorized. Do not create a wallet or save private contact data automatically.
6. **First-party support report — submitted as Business Suite feedback.** The owner explicitly authorized sending the report. Facebook's Report Problem flow stalled on automatic screenshot capture and was cancelled without submission. Business Suite Help → Give Feedback, topic Business Settings → Apps, accepted the text-only report and displayed a confirmation. [Meta's support announcement](https://about.fb.com/news/2025/12/making-it-easier-to-access-account-support-on-facebook-and-instagram/) describes account support and reporting, but does not guarantee a human agent or a developer-SMS repair. The submission record and actual sent text are linked below.

Before another owner-approved SMS attempt, inspect phone spam/blocked messages and ask the carrier about international/application verification SMS if necessary. No carrier-specific fix was established. If +62 is selected, review the national-number format shown by that form; avoid repeatedly trying variants. Do not send US short-code commands such as ON/OTP to 32665 on the basis of foreign anecdotes.

## Options excluded or still conditional

- **Card / Meta Pay / ad billing:** repeatedly reported as successful, so it is a real research finding. It remains unverified for Jessica, involves financial data and may have regional/authorization-hold implications. It is outside the user's no-billing constraint and was not attempted.
- **Wait 24/48 hours:** no reliable universal reset was found. A timer for another security workflow is not evidence for this developer-SMS restriction.
- **Create another portfolio:** Chii already has one; the exact disabled-menu report still sends the user back to developer confirmation.
- **Remove 2FA, delete all numbers, fake/bought accounts or rented SMS:** unnecessary account risk and no verified resolution for this case.
- **Postman or dev.meta.ai:** neither grants this account an Instagram developer app or repairs developer SMS. Postman is documentation/testing tooling.
- **Quest/VR verification workarounds:** separate product; do not assume authenticator/card/organization-invite rules transfer to Facebook/Instagram app registration.
- **Existing approved app operated by a provider:** potentially legitimate through normal Instagram OAuth, but free pricing, media-export capability, permissions and account eligibility must be verified before recommending a provider. No signup or consent occurred.
- **Trusted registered developer managing a dedicated Chii app:** possible collaboration route, but app-role acceptance may itself need developer registration. Ownership, access and maintenance need explicit agreement. No person was contacted.

## Official evidence limits

The public [Meta status dashboard](https://metastatus.com/) showed no known issue for the listed Facebook Login/Graph API products when checked in the connected browser. It had no separate developer-registration SMS indicator. This does not establish SMS health.

[Developer registration](https://developers.facebook.com/docs/development/register/) returned 429 to the research tool; [Add an app to a business portfolio](https://www.facebook.com/business/help/2199735813629697) was login-gated. These research-fetch failures are not evidence of Jessica's account status. The user's own screenshot is evidence of the frequency restriction. No official root-cause explanation for this account was obtained.

## Support submission — 20 October 2026

- The owner explicitly authorized sending the report. An initial attempt through Facebook **Report Problem** stalled during automatic screenshot capture; that flow was backed out of/cancelled, and no report was sent there.
- The report was then successfully submitted through **Business Suite Help → Give Feedback**, with topic **Business Settings → Apps**. This is a feedback submission, not a confirmed tracked support case.
- The confirmation heading was **“Terima kasih sudah membantu kami menyempurnakan diri!”**. Its accompanying message says Meta cannot reply personally to everyone. No case ID was shown, and no human response or resolution timeframe was promised.
- [Exact submitted text](evidence/meta-support-report-2026-10-20.txt) · [Submission confirmation screenshot](evidence/meta-support-submitted-2026-10-20.png).
- Automatic approval review rejected uploading the optional disabled-menu screenshot because explicit authorization for that exact payload and Meta destination was not established. The upload was not retried; the successful submission contained text only, without a screenshot attachment or optional full logs. Full private phone/email values were not included.
- Developer verification and Instagram API activation remain unfinished. Sending feedback does not establish a fix or an official account-specific diagnosis.

## Historical support draft — superseded

This working draft is retained for reference. It is superseded by the [actual submitted text](evidence/meta-support-report-2026-10-20.txt) and is not a verbatim record of the sent payload.

> Subject: Developer registration SMS missing; Business Suite app creation disabled
>
> I manage the Nail Art Palembang business portfolio using my Facebook profile, connected to @chii.nails_. Business Settings shows full portfolio access, but Apps → Add → Create new app ID is disabled. Earlier, opening developers.facebook.com/apps redirected this browser session into Business Suite advertising-app settings. After a fresh Facebook login, it now leads to the developer homepage; Get Started opens registration with Register complete, Verify account incomplete, and Contact info/About you pending. Developer registration previously failed to deliver the verification SMS and displayed a slow-down/frequency restriction. The current code-entry screen targets a different existing listed number; the owner reports that no SMS arrived, and no email/WhatsApp alternative is visible on that screen.
>
> Country: Indonesia (+62). Last attempt and timezone: [owner to fill]. Carrier: [owner to fill]. Existing Facebook email/phone details show no pending-confirmation warning or Confirm button; developer verification remains incomplete. Latest SMS delivery: owner reports no SMS arrived. Isolated-session result: [not yet tested].
>
> Please check whether developer registration is incomplete or restricted, explain why app creation is disabled, and provide an available verification/recovery route. I can supply a redacted screenshot through this official support channel. Please do not treat this as a WhatsApp Cloud API number-registration or Meta Quest issue.

Keep full phone numbers, passwords, OTPs, access tokens and payment data out of public posts and this repository. Any future separately authorized attachment should contain only the relevant redacted screen.
