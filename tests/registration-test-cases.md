# Registration and email test cases (use test recipients first)

| # | Case | Expected |
|---|---|---|
| 1 | Valid new registration | Confirmation screen with server ID; row in Registrations; confirmation email |
| 2 | Missing first name | Inline error, focus moves to field, no request sent |
| 3 | Missing last name | Same |
| 4 | Invalid email (`a@b`) | Inline error, no request |
| 5 | Same email twice | Original ID returned, notice shown, no second email, no second row |
| 6 | Network offline | "Could not reach…" message; values kept; button restored |
| 7 | Server returns `success:false` | Server message shown; no confirmation |
| 8 | Response is not JSON | "Unexpected response… check your inbox" message |
| 9 | Honeypot filled (set `#company` in devtools) | Generic failure; no row (Errors sheet logs it) |
| 10 | ID generation under two simultaneous submits | Two different sequential IDs |
| 11 | Confirmation email delivery | Arrives; correct ID, date, speakers; plain-text part present |
| 12 | Double-click Reserve | One request; button disabled, "Registering…" |
| 13 | Event details in all five emails | 22 October 2026, 6:00 PM WAT, correct talk titles |
| 14 | Calendar links | Google/Outlook/.ics open 17:00 UTC start; end matches confirmed end time |
| 15 | Reminder eligibility | Late registrants get `SKIPPED: registered after schedule` for earlier reminders |
| 16 | Run `processReminders` twice on a due day | Second run sends nothing |
| 17 | Follow-up consent | No consent and no recording request → `SKIPPED`; consent → sent |
| 18 | Unsubscribe link in follow-up | Consent column becomes `No`; Notes updated; invalid token rejected |
| 19 | Mobile (390 px) | No horizontal scroll; sticky CTA hides over hero/form; form usable |
| 20 | Keyboard only | Skip link, menu, form, FAQ, poll all operable; focus visible |
Also: poll submit with no choice (validation message), poll with choice (row in Polls), `updateQuestion` with wrong email (rejected).
