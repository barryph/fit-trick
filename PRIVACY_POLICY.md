# Privacy Policy — Kadence

> **Effective Date:** 2026/08/25
> **Last Updated:** 2026/08/25
> **Version:** 1.0

**Kadence** (the "App") is a mobile exercise tracker and exercise activity
queue provided by **Kadence** ("we", "our", or "us", "[Company Name]" as
legally established). This Privacy Policy explains what personal information
we collect, why we collect it, how we use and share it, and the choices you
have.

By using Kadence, you agree to the collection and use of information described
in this policy. If you do not agree, please do not use the App. This policy is
governed by and aligned with the **New Zealand Privacy Act 2020** (our home
jurisdiction), the **General Data Protection Regulation (GDPR)** (EU/UK) where
it applies to you, and the California **CCPA/CPRA** where it applies to you.

---

## 1. Information We Collect

We collect only the information needed to run the App, secure your account,
and improve the experience. We collect the categories described below.

### 1.1 Information you provide directly

- **Account information** — your **email address** and a **password** you
  choose when you register with an email and password, or the email associated
  with your account after signing up through a social provider.
- **Social sign-in identifiers** — when you sign in with **Google** or
  **Apple**, we receive the basic profile data returned by the provider
  (primarily your **email address** and a **provider identifier**) so we can
  recognise your account on future visits.
- **Exercise data** — the workout and activity information you choose to
  record and organise using Kadence (for example, your exercise queue, the
  exercises you complete, timings, categories, and customisations you make).
  This is the core data the App is designed to hold.
- **Communications you send us** — if you contact us for support, we receive
  the contents of your message.

### 1.2 Information collected automatically while you use the App

- **Session identifiers** — when you sign in, our server issues a session
  cookie and stores a matching session record so the App can recognise you as
  signed in. The cookie itself contains no personal information beyond a
  random session identifier; personal data is stored server-side and linked
  to that identifier. See Section 3 for details and how to end a session.
- **Device and usage information** — basic details about the device and app
  version, language and region settings, the pages/screens you open and how
  you interact with the App, and performance/log information. This is largely
  collected through analytics and crash-reporting tools (see Section 3).
- **IP address and network information** — your IP address may be collected
  automatically as part of normal network/security logging when the App
  connects to our servers.
- **Log and diagnostic data** — error logs, crash reports, and related
  diagnostic data used to identify and fix issues. These can include limited
  device information (for example, device model, operating system version, and
  app version).

> **Note on generic checklist items:** generic privacy templates often list
> "IP addresses", "cookies", "payment details", and "advertising". For Kadence
> specifically: we **do not** sell your data, we do **not** advertise within
> or from the App, and we do **not** process credit-card or other payment card
> details. We **do** use a strictly necessary session cookie for
> authentication (see Section 1.2 above and Section 3). Please read Sections 3
> and 4 below for how "cookies / tracking" and "advertising" apply to Kadence.

---

## 2. How We Use Your Information

We use the information we collect for the following purposes:

- **Account authentication and security** — to create and maintain your
  account, verify your identity when you sign in (including email/password,
  Google, and Apple sign-in), and protect against unauthorised access.
  Processing a request to create or modify your account is necessary for the
  performance of the contract with you.
- **Providing and personalising the App** — to operate the exercise tracker
  and activity queue, store your exercise data so they are available across
  your sessions, and apply customisations you choose.
- **Customer support** — to respond to questions, requests, and resolve
  issues you raise with us. Processing is based on our legitimate interest in
  providing a functional service and supporting you.
- **Security, integrity, and fraud prevention** — to detect, investigate, and
  prevent errors, misuse, and abusive or unauthorised activity. This is based
  on our legitimate interest in keeping the service and your data safe.
- **Analytics and product improvement** — to understand how the App is used,
  diagnose and fix technical problems, and improve features. Processing rests
  on our legitimate interest in improving the product, or on your consent
  where required (for GDPR/CCPA purposes the details are in Sections 3 and 4).
- **Legal obligations** — to comply with applicable laws, regulation, legal
  process, enforceable governmental requests, or to establish, exercise, or
  defend legal claims.

We **do not** sell your personal information, and we do not use it for targeted
advertising.

---

## 3. Third-Party Services and Tools

We partner with the following providers to run, secure, and improve the App.
Each acts as a processor (or, in the CCPA context a "service provider")
operating on our behalf under contract. Where a provider processes data based
on its own legitimate or direct need, its own privacy policy also applies.

| Service | What it does | Data it may process |
|---|---|---|
| **Google Firebase — Analytics** (`@react-native-firebase/analytics`) | App and event analytics; aggregated usage reports | usage events, device and app-version information, anonymised/session identifiers |
| **Google Firebase — Crashlytics** (`@react-native-firebase/crashlytics`) | Crash reporting and diagnostics | crash logs, stack traces, limited device model / OS / app-version information |
| **Google Sign-In / Google OAuth** | Login with your Google account | only the OIDC `email`/`profile` scopes — your Google email and a subject identifier; we do not request further Google API access |
| **Apple Sign-In** (iOS) | Login with your Apple ID | Your Apple account email or a hidden relay email and an Apple identifier |
| **Google Play Services** (Android) | System services and the Google Sign-In flow on Android devices | Handled by Google on your device per Google's terms; we do not receive Play-services data other than what the sign-in provides |
| **Expo / Expo Go & EAS** | Development framework, build tooling, and development client | Minimal device/session diagnostic data used for building, launching and debugging during development |
| **Hosting provider & database** | AWS S3 Backend server and AWS RDS storage | Host servers in secure datacenters; your account and exercise data is stored there |

**Payment processors (Stripe, PayPal, etc.):** Kadence **does not** currently
process payments or subscriptions, and no payment card details are collected,
stored, or transmitted by the App. If in the future we introduce payments or a
premium tier, we will use a PCI-DSS-compliant third-party processor, update
this Policy, and still not send payment card details to our servers.

**Advertising networks:** Kadence does **not** display or serve third-party
advertising in the App, and we do not share personal information with
advertising networks.

**Cookies and similar technology:** Kadence uses a few cookies and similar
technologies for specific, limited purposes:

- **Session cookie** — when you sign in, we issue an `httpOnly` session cookie
  (`express-session`) so the App can recognise you as signed in on subsequent
  requests. The matching session data is stored securely on our servers (in a
  `user_sessions` table) rather than in the cookie itself. The cookie is
  `secure` (sent only over HTTPS), set with `SameSite=Strict`, and is cleared
  when your session expires (up to 14 days) or when you sign out or delete
  your account. You can sign out at any time to end the session. This cookie
  is strictly necessary for authentication, so we do not require separate
  consent to set it under applicable rules.
- **Analytics and crash reporting** — as noted in Section 3, the analytics
  and crash-reporting tools use identifiers and similar technology to collect
  aggregated usage information and crash diagnostics. These are not used to
  target advertising.
- **Local preferences** — the App stores non-sensitive preferences locally on
  your device (for example UI customisations) so they persist between
  sessions. This data stays on your device.

---

## 4. Data Retention and International Transfers

- **Retention:** We keep personal and exercise data for as long as your
  account is active, or as needed to provide the service, meet support needs,
  or comply with legal obligations. When you delete your account (see
  Section 6), we delete or anonymise your personal data except where we must
  keep it for legal/compliance reasons (for example, audit or transactional
  records), subject to the applicable retention limit.
- **Where data is stored and transferred:** Data is stored on secure servers
  and may be processed in countries other than where you live. When we
  transfer data that is protected by a local privacy law (for example, in the
  EU/UK or California), we rely on appropriate safeguards — such as
  **Standard Contractual Clauses (SCCs)** or another approved transfer
  mechanism for EU/UK personal data, and on applicable contractual and
  statutory permissions elsewhere.

---

## 5. Data Security

We take reasonable and proportionate measures to protect your data against
unauthorised access, alteration, disclosure, or destruction. These include:

- **Encryption in transit** — sensitive data is transmitted over
  **Transport Layer Security (TLS / "SSL")** between the App and our servers.
- **Passwords** — account passwords are stored only as **strong, salted,
  one-way hashes** (never in plain text). We recommend you choose a strong
  password and do not reuse it elsewhere.
- **Access controls** — our systems limit access to personal data to
  authorised personnel only, guided by the principle of least privilege.
- **Ongoing review** — we regularly assess our security practices and
  safeguards to protect the integrity and confidentiality of personal data.

No method of transmission over the Internet or electronic storage is 100%
secure. While we work hard to protect your data, we cannot guarantee absolute
security, and you are responsible for ensuring your device is secure (for
example by installing security updates and using a device screen lock).

---

## 6. Your Rights

Depending on where you live, you may have the following rights. We provide
them all, to the extent required by law.

### Requesting access to your data
The right to ask for a copy of the personal information we hold about you.

### Correction
The right to ask us to correct anything you think is incomplete or inaccurate
(for example, to update your exercise data or your account email).

### Erasure / deletion
- **Delete your account in the App:** in "Profile" you can delete your
  account or write to support. We will then delete or
  anonymise the related data as described in Section 4.
- **Delete application data:** Android and iOS let you clear the App's local
  data. Note that clearing local data does **not** delete data stored on our
  servers; see "deletion" above in Section 6 for that.

### Restriction and portability
- The right to ask us to restrict processing in certain circumstances, and,
  under the GDPR or CCPA (as applicable), to receive your exercise and
  account data in a commonly used, machine-readable format.

### Objection
- Where we rely on legitimate interest, you can object to the processing and
  we will stop unless we have compelling legitimate grounds.

### Withdraw consent
- Where processing based on consent, you may withdraw it at any time without
  affecting the lawfulness of processing before the withdrawal.

### Automated decision making
- We do not make decisions affecting you based solely on automated
  processing that produces legal or similarly significant effects.

### CCPA/CPRA specific rights (California)
California residents have consumer rights under the California Consumer
Privacy Act and the California Privacy Rights Act, including the rights **to
know**, **to correct**, **to delete**, and **to data portability**, and the
right **not to be discriminated against** for exercising those rights. We
**do not sell** personal information, and we do not treat you differently
because you exercise these rights.

### New Zealand Privacy Act 2020
You have the right to request access to, and correction of, personal
information we hold about you. You can make such a request, and we will
respond within statutory time frames.

### How to exercise these rights
Write to us using the details in Section 9. We may ask you to verify your
identity before processing your request to protect your data. We respond to
valid, verifiable requests within the period required by the applicable law
(typically 30 days; GDPR may allow additional notice). If we refuse or do not
respond to your request you may lodge a complaint with your local supervising
authority (in New Zealand, the **Office of the Privacy Commissioner**; in the
EU/UK, your data protection authority; in California, the California Attorney
General).

---

## 7. Children's Privacy

Kadence is not directed at children, and we do not knowingly collect personal
information from children under the age of 13 (or the higher age under
applicable law in your region, such as 16 for GDPR consent). If you are
younger, please do not create an account or provide personal data. If we
become aware we have collected a child's personal data without consent, we
will take steps to delete it. To report it, contact us using the details
below.

---

## 8. Changes to This Policy

We may update this Privacy Policy from time to time to reflect changes in our
practices, the App, or legal requirements. When we make material changes, we
will tell you (for example, by displaying a notice in the App or emailing you
at the address we have on file). We will show the "Effective Date" at the top
of this policy. Your continued use of Kadence after a change is effective
means you accept the updated policy, subject to any consent that local law
may otherwise require.

---

## 9. Contact Us

We are happy to answer your questions, or process a rights request. Please
reach out to us:

- **Privacy contact:** codecompletelabs+privacy@gmail.com
- **Support:** codecompletelabs+support@gmail.com

For formal or rights-related correspondence, please mention "Privacy Policy /
Request" in the subject line when you contact us.
