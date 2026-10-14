/**
 * THE FUTURE OF FINANCE LECTURE SERIES: LECTURE 02 (The AI Economy)
 * Registration, poll, feedback and automated email backend.
 *
 * Deploy as: Web app, Execute as "Me", Who has access "Anyone".
 * Bind this script to the Lecture 02 Google Sheet (Extensions > Apps Script) and set the
 * project time zone to Africa/Lagos (Project Settings, or appsscript.json "timeZone").
 * Run setupSheets() once, then setupTriggers(). See deployment-notes.md in the README.
 */

/* ============================== CONFIG ============================== */
const CONFIG = {
  EVENT_ID: 'FOF-L02',
  ID_PREFIX: 'FOF-L02-',
  TZ: 'Africa/Lagos',
  SENDER_NAME: 'The Future of Finance Lecture Series',
  REPLY_TO: '',            // organiser contact email shown in emails; recommended
  SITE_URL: '',            // production URL of the Lecture 02 page (no trailing slash needed)
  JOIN_URL: '',            // leave empty until the organiser confirms; emails then say it will follow
  RECORDING_URL: '',       // leave empty unless a recording exists
  FEEDBACK_URL: '',        // post-event survey link, if used
  EVENT_TITLE: 'The AI Economy: Who Pays, Who Profits, and Where Does Nigeria Fit?',
  SERIES: 'The Future of Finance Lecture Series',
  EPISODE: 'Lecture 02 | The AI Economy',
  DESCRIPTION: 'Exploring AI investment, superintelligence, economic opportunity and the future of Nigeria in an AI-driven world.',
  WHEN_TEXT: 'Thursday, 22 October 2026, 6:00 PM WAT (UTC+1)',
  START_UTC: '2026-10-22T17:00:00Z',
  DURATION_MIN: 90,        // ASSUMPTION: confirm the end time before launch
  EVENT_DATE: '2026-10-22',
  EVENT_END_ISO: '2026-10-22T19:30:00Z', // pre-event reminders stop after this moment
  SHEETS: { REG: 'Registrations', POLL: 'Polls', FEEDBACK: 'Feedback', ERR: 'Errors' },
  POLL_ANSWERS: [
    'Reliable electricity and computing infrastructure',
    'Affordable access to AI tools',
    'Skills, education and talent development',
    'Investment and business innovation',
    'Data, language and locally relevant applications',
    'Governance, trust and responsible use'
  ],
  // Pre-event reminders and follow-up. "date" is the Lagos calendar day on which each is sent.
  MESSAGES: [
    { key: 'r3', col: 'Reminder 3-Day Status', date: '2026-10-19', pre: true },
    { key: 'r1', col: 'Reminder 1-Day Status', date: '2026-10-21', pre: true },
    { key: 'r0', col: 'Day-Of Reminder Status', date: '2026-10-22', pre: true },
    { key: 'fu', col: 'Follow-up Status', date: '2026-10-23', pre: false }
  ]
};

const REG_HEADERS = ['Timestamp', 'Registration ID', 'Event ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Country',
  'Organisation', 'Role', 'Referral Source', 'Question', 'Attend Live', 'Request Recording', 'Consent Follow-up',
  'Landing Page', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Confirmation Status', 'Reminder 3-Day Status',
  'Reminder 1-Day Status', 'Day-Of Reminder Status', 'Attendance Status', 'Follow-up Status', 'Feedback Status', 'Notes'];
const POLL_HEADERS = ['Timestamp', 'Event ID', 'Question', 'Answer', 'UTM Source', 'UTM Medium', 'UTM Campaign'];
const FEEDBACK_HEADERS = ['Timestamp', 'Event ID', 'Registration ID', 'Overall Rating', 'Perceived Usefulness',
  'Most Useful Session', 'Suggestions', 'Permission To Quote'];
const ERR_HEADERS = ['Timestamp', 'Where', 'Message', 'Context'];

/* ============================== HTTP ============================== */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ success: false, message: 'Invalid request.' });
  }
  try {
    if (!body || body.eventId !== CONFIG.EVENT_ID) return json_({ success: false, message: 'Invalid request.' });
    switch (body.action) {
      case 'register': return json_(handleRegister_(body));
      case 'updateQuestion': return json_(handleUpdateQuestion_(body));
      case 'poll': return json_(handlePoll_(body));
      case 'feedback': return json_(handleFeedback_(body));
      default: return json_({ success: false, message: 'Invalid request.' });
    }
  } catch (err) {
    logError_('doPost', err, { action: body && body.action });
    return json_({ success: false, message: 'Something went wrong on our side. Please try again in a moment.' });
  }
}

// Health check and unsubscribe only. Never returns spreadsheet data.
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'unsubscribe') return handleUnsubscribe_(p);
  return json_({ success: true, service: CONFIG.EVENT_ID });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================== REGISTER ============================== */
function handleRegister_(b) {
  if (b.company) { logError_('register', 'Honeypot filled', {}); return { success: false, message: 'We could not complete your registration.' }; }

  const first = clean_(b.firstName, 80), last = clean_(b.lastName, 80);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
  if (!first || !last) return { success: false, message: 'Please enter your first and last name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { success: false, message: 'Please enter a valid email address.' };

  const yes = v => (v === 'Yes' ? 'Yes' : 'No'); // consent only counts when explicitly "Yes"
  const sheet = getSheet_(CONFIG.SHEETS.REG, REG_HEADERS);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let id, rowNum, dup = false;
  try {
    const col = colMap_(sheet);
    const last_ = sheet.getLastRow();
    if (last_ > 1) {
      const emails = sheet.getRange(2, col['Email'], last_ - 1, 1).getValues();
      const ids = sheet.getRange(2, col['Registration ID'], last_ - 1, 1).getValues();
      for (let i = 0; i < emails.length; i++) {
        if (String(emails[i][0]).toLowerCase() === email) { id = ids[i][0]; dup = true; break; }
      }
    }
    if (!dup) {
      id = nextId_();
      const row = REG_HEADERS.map(() => '');
      const set = (h, v) => { row[REG_HEADERS.indexOf(h)] = v; };
      set('Timestamp', nowText_());
      set('Registration ID', id);
      set('Event ID', CONFIG.EVENT_ID);
      set('First Name', first); set('Last Name', last); set('Email', email);
      set('Phone', clean_(b.phone, 40)); set('Country', clean_(b.country, 80));
      set('Organisation', clean_(b.organisation, 160)); set('Role', clean_(b.role, 80));
      set('Referral Source', clean_(b.referralSource, 80));
      set('Question', clean_(b.question, 1000));
      set('Attend Live', yes(b.attendLive)); set('Request Recording', yes(b.requestRecording));
      set('Consent Follow-up', yes(b.consentFollowup));
      set('Landing Page', clean_(b.landingPage, 300));
      set('UTM Source', clean_(b.utmSource, 100)); set('UTM Medium', clean_(b.utmMedium, 100));
      set('UTM Campaign', clean_(b.utmCampaign, 100));
      set('Confirmation Status', 'PENDING');
      set('Attendance Status', 'registered');
      sheet.appendRow(row);
      rowNum = sheet.getLastRow();
      SpreadsheetApp.flush();
    }
  } finally {
    lock.releaseLock();
  }

  if (dup) return { success: true, registrationId: id, duplicate: true, message: 'You are already registered.' };

  // Confirmation is sent only after the row is safely recorded.
  const emailSent = sendConfirmationForRow_(sheet, rowNum);
  return { success: true, registrationId: id, emailSent: emailSent, message: 'Your place has been reserved.' };
}

function sendConfirmationForRow_(sheet, rowNum) {
  const reg = readRow_(sheet, rowNum);
  try {
    sendEmail_('confirm', reg);
    setStatus_(sheet, rowNum, 'Confirmation Status', 'SENT ' + nowText_());
    return true;
  } catch (err) {
    setStatus_(sheet, rowNum, 'Confirmation Status', 'ERROR ' + nowText_() + ': ' + String(err.message).slice(0, 120));
    logError_('confirmation', err, { id: reg['Registration ID'] });
    return false;
  }
}

function handleUpdateQuestion_(b) {
  const q = clean_(b.question, 1000);
  if (!q) return { success: false, message: 'Please write a question.' };
  const sheet = getSheet_(CONFIG.SHEETS.REG, REG_HEADERS);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const rowNum = findRow_(sheet, String(b.registrationId || ''), String(b.email || '').toLowerCase());
    if (!rowNum) return { success: false, message: 'We could not match your registration.' };
    const col = colMap_(sheet);
    const cell = sheet.getRange(rowNum, col['Question']);
    const prev = String(cell.getValue() || '');
    cell.setValue((prev ? prev + ' | UPDATE: ' : '') + q).setNumberFormat('@');
    return { success: true, message: 'Question received.' };
  } finally { lock.releaseLock(); }
}

/* ============================== POLL & FEEDBACK ============================== */
function handlePoll_(b) {
  if (CONFIG.POLL_ANSWERS.indexOf(b.answer) === -1) return { success: false, message: 'Please choose one of the options.' };
  const sheet = getSheet_(CONFIG.SHEETS.POLL, POLL_HEADERS);
  sheet.appendRow([nowText_(), CONFIG.EVENT_ID, clean_(b.question, 200), b.answer,
    clean_(b.utmSource, 100), clean_(b.utmMedium, 100), clean_(b.utmCampaign, 100)]);
  return { success: true, message: 'Recorded.' };
}

function handleFeedback_(b) {
  const rating = Number(b.rating);
  if (!(rating >= 1 && rating <= 5)) return { success: false, message: 'Please give a rating from 1 to 5.' };
  const fb = getSheet_(CONFIG.SHEETS.FEEDBACK, FEEDBACK_HEADERS);
  let regId = '';
  const reg = getSheet_(CONFIG.SHEETS.REG, REG_HEADERS);
  const rowNum = b.registrationId ? findRow_(reg, String(b.registrationId), String(b.email || '').toLowerCase()) : 0;
  if (rowNum) { regId = String(b.registrationId); setStatus_(reg, rowNum, 'Feedback Status', 'RECEIVED ' + nowText_()); }
  fb.appendRow([nowText_(), CONFIG.EVENT_ID, regId, rating, clean_(b.usefulness, 40), clean_(b.mostUseful, 120),
    clean_(b.suggestions, 1500), b.quotePermission === 'Yes' ? 'Yes' : 'No']);
  return { success: true, message: 'Thank you for your feedback.' };
}

/* ============================== UNSUBSCRIBE ============================== */
function unsubToken_(id, email) {
  let secret = PropertiesService.getScriptProperties().getProperty('UNSUB_SECRET');
  if (!secret) { secret = Utilities.getUuid() + Utilities.getUuid(); PropertiesService.getScriptProperties().setProperty('UNSUB_SECRET', secret); }
  const sig = Utilities.computeHmacSha256Signature(id + '|' + email, secret);
  return Utilities.base64EncodeWebSafe(sig).slice(0, 24);
}

function handleUnsubscribe_(p) {
  const sheet = getSheet_(CONFIG.SHEETS.REG, REG_HEADERS);
  const id = String(p.id || ''), reg = findRowById_(sheet, id);
  let msg = 'This link is not valid.';
  if (reg) {
    const row = readRow_(sheet, reg);
    if (p.t && p.t === unsubToken_(id, String(row['Email']).toLowerCase())) {
      const col = colMap_(sheet);
      sheet.getRange(reg, col['Consent Follow-up']).setValue('No');
      const n = sheet.getRange(reg, col['Notes']);
      n.setValue((String(n.getValue()) + ' Unsubscribed ' + nowText_()).trim());
      msg = 'You have been unsubscribed from future communications about the lecture series. Event emails about Lecture 02 that you requested may still be sent.';
    }
  }
  return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Georgia,serif;max-width:480px;margin:15vh auto;padding:0 20px;color:#14181F"><h2>' + CONFIG.SERIES + '</h2><p>' + esc_(msg) + '</p></body>');
}

/* ============================== REMINDERS ============================== */
/** Daily trigger target. Safe to run repeatedly: a message is sent only when its status cell is empty or ERROR. */
function processReminders() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { logError_('processReminders', 'Could not get lock', {}); return; }
  try {
    const now = new Date();
    const today = Utilities.formatDate(now, CONFIG.TZ, 'yyyy-MM-dd');
    const due = CONFIG.MESSAGES.filter(m => m.date === today);
    if (!due.length) return;
    const sheet = getSheet_(CONFIG.SHEETS.REG, REG_HEADERS);
    const last = sheet.getLastRow();
    if (last < 2) return;
    const eventOver = now > new Date(CONFIG.EVENT_END_ISO);

    due.forEach(m => {
      if (m.pre && eventOver) return; // never send a pre-event reminder after the event
      for (let r = 2; r <= last; r++) {
        if (MailApp.getRemainingDailyQuota() < 1) { logError_('processReminders', 'Email quota exhausted', { message: m.key }); return; }
        const reg = readRow_(sheet, r);
        if (reg['Event ID'] !== CONFIG.EVENT_ID) continue;
        const st = String(reg[m.col] || '');
        if (st && st.indexOf('ERROR') !== 0) continue;                // already SENT or SKIPPED
        if (String(reg['Attendance Status']).toLowerCase() === 'cancelled') { setStatus_(sheet, r, m.col, 'SKIPPED: cancelled'); continue; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(reg['Email']))) { setStatus_(sheet, r, m.col, 'SKIPPED: invalid email'); continue; }
        if (String(reg['Timestamp']).slice(0, 10) > m.date) { setStatus_(sheet, r, m.col, 'SKIPPED: registered after schedule'); continue; }
        if (m.key === 'fu' && reg['Consent Follow-up'] !== 'Yes' && reg['Request Recording'] !== 'Yes') {
          setStatus_(sheet, r, m.col, 'SKIPPED: no consent or request'); continue;
        }
        try {
          sendEmail_(m.key, reg);
          setStatus_(sheet, r, m.col, 'SENT ' + nowText_());       // marked only after a successful send
        } catch (err) {
          setStatus_(sheet, r, m.col, 'ERROR ' + nowText_() + ': ' + String(err.message).slice(0, 120));
          logError_('reminder:' + m.key, err, { id: reg['Registration ID'] });
        }
      }
    });
  } finally { lock.releaseLock(); }
}

/** Manual recovery: retries confirmations that are PENDING or ERROR (run from the editor). */
function retryFailedConfirmations() {
  const sheet = getSheet_(CONFIG.SHEETS.REG, REG_HEADERS);
  const col = colMap_(sheet);
  for (let r = 2; r <= sheet.getLastRow(); r++) {
    const st = String(sheet.getRange(r, col['Confirmation Status']).getValue());
    if (st === 'PENDING' || st.indexOf('ERROR') === 0) sendConfirmationForRow_(sheet, r);
  }
}

/* ============================== TRIGGERS ============================== */
/** Creates ONE daily trigger (runs between 09:00 and 10:00 Lagos time). Re-running does not duplicate it. */
function setupTriggers() {
  cleanupTriggers();
  ScriptApp.newTrigger('processReminders').timeBased().everyDays(1).atHour(9).inTimezone(CONFIG.TZ).create();
}
function cleanupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'processReminders') ScriptApp.deleteTrigger(t); });
}

/* ============================== ADMIN / TESTING ============================== */
function setupSheets() {
  getSheet_(CONFIG.SHEETS.REG, REG_HEADERS); getSheet_(CONFIG.SHEETS.POLL, POLL_HEADERS);
  getSheet_(CONFIG.SHEETS.FEEDBACK, FEEDBACK_HEADERS); getSheet_(CONFIG.SHEETS.ERR, ERR_HEADERS);
}

/** Sends every template to the script owner only, marked [TEST]. */
function sendTestEmails() {
  const to = Session.getEffectiveUser().getEmail();
  const reg = { 'Registration ID': 'FOF-L02-00000', 'First Name': 'Test', 'Last Name': 'Recipient', 'Email': to,
    'Consent Follow-up': 'Yes', 'Request Recording': 'Yes', 'Question': '' };
  ['confirm', 'r3', 'r1', 'r0', 'fu'].forEach(k => sendEmail_(k, reg, '[TEST] '));
}

/* ============================== EMAIL ============================== */
function sendEmail_(type, reg, subjectPrefix) {
  const m = renderEmail_(type, reg);
  const opts = { to: reg['Email'], subject: (subjectPrefix || '') + m.subject, body: m.text, htmlBody: m.html, name: CONFIG.SENDER_NAME };
  if (CONFIG.REPLY_TO) opts.replyTo = CONFIG.REPLY_TO;
  MailApp.sendEmail(opts);
}

function calendarUrl_() {
  const s = new Date(CONFIG.START_UTC), e = new Date(s.getTime() + CONFIG.DURATION_MIN * 60000);
  const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(CONFIG.SERIES + ': ' + CONFIG.EPISODE) +
    '&dates=' + f(s) + '/' + f(e) + '&details=' + encodeURIComponent(CONFIG.DESCRIPTION + (CONFIG.SITE_URL ? '\n' + CONFIG.SITE_URL : '')) +
    '&location=' + encodeURIComponent('Online');
}

function renderEmail_(type, reg) {
  const name = esc_(reg['First Name'] || 'there');
  const id = esc_(reg['Registration ID'] || '');
  const joinHtml = CONFIG.JOIN_URL
    ? '<p style="margin:0 0 16px"><b>Joining link:</b> <a href="' + esc_(CONFIG.JOIN_URL) + '" style="color:#7A0E1F">' + esc_(CONFIG.JOIN_URL) + '</a></p>'
    : '<p style="margin:0 0 16px"><b>Joining link:</b> we will email it to you before the lecture.</p>';
  const joinText = CONFIG.JOIN_URL ? 'Joining link: ' + CONFIG.JOIN_URL : 'Joining link: we will email it to you before the lecture.';

  const speakersHtml =
    '<p style="margin:0 0 6px"><b>Convener\'s address:</b> Dr. John A. Olayiwola<br><i>The Economics of the AI Revolution: Who Pays, Who Profits, and Where Does Nigeria Fit?</i></p>' +
    '<p style="margin:0 0 6px"><b>Invited presentation:</b> Olufemi Adeyemo<br><i>Billions and AI: Is It Really a Game Changer?</i></p>' +
    '<p style="margin:0 0 16px"><b>Joint discussion and audience Q&amp;A:</b> <i>From AI Investment to African Opportunity</i></p>';
  const speakersText = 'Convener\'s address: Dr. John A. Olayiwola - The Economics of the AI Revolution: Who Pays, Who Profits, and Where Does Nigeria Fit?\n' +
    'Invited presentation: Olufemi Adeyemo - Billions and AI: Is It Really a Game Changer?\n' +
    'Joint discussion and audience Q&A: From AI Investment to African Opportunity\n';

  const themesHtml = '<ul style="margin:0 0 16px;padding-left:20px"><li>The money behind AI</li><li>The distribution of value</li><li>The feasibility of superintelligence</li><li>Nigeria\'s place in the AI economy</li></ul>';
  const themesText = '- The money behind AI\n- The distribution of value\n- The feasibility of superintelligence\n- Nigeria\'s place in the AI economy\n';

  const calHtml = '<p style="margin:0 0 16px"><a href="' + esc_(calendarUrl_()) + '" style="color:#7A0E1F">Add to Google Calendar</a></p>';
  const calText = 'Add to Google Calendar: ' + calendarUrl_() + '\n';

  const when = '<p style="margin:0 0 16px"><b>' + esc_(CONFIG.WHEN_TEXT) + '</b><br>Online, free to attend</p>';
  const P = t => '<p style="margin:0 0 16px">' + t + '</p>';
  let subject, pre, body = '', text = '', cta = null;

  if (type === 'confirm') {
    subject = 'Registration Confirmed: Future of Finance Lecture Series — Lecture 02';
    pre = 'Your place is reserved. Registration ID ' + (reg['Registration ID'] || '');
    body = P('Hello ' + name + ',') + P('Your registration for Lecture 02 has been received. Your place is reserved.') +
      '<p style="margin:0 0 16px;padding:12px 14px;background:#ECE5D6"><b>Registration ID:</b> ' + id + '</p>' +
      P('<b>' + esc_(CONFIG.EVENT_TITLE) + '</b><br>' + esc_(CONFIG.DESCRIPTION)) + when + joinHtml + speakersHtml + calHtml;
    text = 'Hello ' + (reg['First Name'] || 'there') + ',\n\nYour registration for Lecture 02 has been received. Your place is reserved.\nRegistration ID: ' + (reg['Registration ID'] || '') + '\n\n' +
      CONFIG.EVENT_TITLE + '\n' + CONFIG.DESCRIPTION + '\n\n' + CONFIG.WHEN_TEXT + '\nOnline, free to attend\n' + joinText + '\n\n' + speakersText + '\n' + calText;
    cta = CONFIG.SITE_URL ? ['View event details', CONFIG.SITE_URL] : null;
  } else if (type === 'r3') {
    subject = 'In 3 Days: The Future of Finance Lecture Series — Lecture 02';
    pre = 'Lecture 02 is on Thursday 22 October at 6:00 PM WAT';
    body = P('Hello ' + name + ',') + P('Lecture 02 of The Future of Finance Lecture Series takes place in three days. Here is what the conversation will cover:') + themesHtml + when + calHtml;
    text = 'Hello ' + (reg['First Name'] || 'there') + ',\n\nLecture 02 takes place in three days. Themes:\n' + themesText + '\n' + CONFIG.WHEN_TEXT + '\nOnline, free to attend\n\n' + calText;
    cta = CONFIG.SITE_URL ? ['View event details', CONFIG.SITE_URL] : null;
  } else if (type === 'r1') {
    subject = 'Tomorrow: The AI Economy — Future of Finance Lecture 02';
    pre = 'Tomorrow at 6:00 PM WAT';
    body = P('Hello ' + name + ',') + P('Lecture 02 is tomorrow.') + when + joinHtml + speakersHtml + calHtml;
    text = 'Hello ' + (reg['First Name'] || 'there') + ',\n\nLecture 02 is tomorrow.\n\n' + CONFIG.WHEN_TEXT + '\n' + joinText + '\n\n' + speakersText + '\n' + calText;
    cta = CONFIG.JOIN_URL ? ['Join the lecture', CONFIG.JOIN_URL] : null;
  } else if (type === 'r0') {
    subject = 'Today at 6 PM WAT: The AI Economy';
    pre = 'Lecture 02 starts at 6:00 PM WAT today';
    body = P('Hello ' + name + ',') + P('Lecture 02 is today at <b>6:00 PM WAT</b>.') + joinHtml;
    text = 'Hello ' + (reg['First Name'] || 'there') + ',\n\nLecture 02 is today at 6:00 PM WAT.\n' + joinText + '\n';
    cta = CONFIG.JOIN_URL ? ['Join the lecture', CONFIG.JOIN_URL] : null;
  } else { // follow-up
    subject = 'Thank you for joining Lecture 02: The AI Economy';
    pre = 'Thank you, and what comes next';
    body = P('Hello ' + name + ',') + P('Thank you for your interest in Lecture 02 of The Future of Finance Lecture Series.');
    text = 'Hello ' + (reg['First Name'] || 'there') + ',\n\nThank you for your interest in Lecture 02 of The Future of Finance Lecture Series.\n';
    if (reg['Request Recording'] === 'Yes' && CONFIG.RECORDING_URL) {
      body += P('<b>Recording:</b> <a href="' + esc_(CONFIG.RECORDING_URL) + '" style="color:#7A0E1F">watch here</a>.');
      text += '\nRecording: ' + CONFIG.RECORDING_URL + '\n';
    }
    if (CONFIG.FEEDBACK_URL) {
      body += P('We would value your feedback: <a href="' + esc_(CONFIG.FEEDBACK_URL) + '" style="color:#7A0E1F">take the short survey</a>.');
      text += '\nFeedback survey: ' + CONFIG.FEEDBACK_URL + '\n';
    }
    if (reg['Consent Follow-up'] === 'Yes') {
      body += P('You asked to hear about future lectures in the series. We will share details as they are confirmed.');
      text += '\nYou asked to hear about future lectures in the series. We will share details as they are confirmed.\n';
    }
  }

  // Footer: privacy line, contact, unsubscribe for communications that depend on consent.
  let foot = 'You are receiving this because you registered for Lecture 02.';
  let footText = foot;
  if (CONFIG.REPLY_TO) { foot += ' Questions or privacy requests: <a href="mailto:' + esc_(CONFIG.REPLY_TO) + '" style="color:#D9B87A">' + esc_(CONFIG.REPLY_TO) + '</a>.'; footText += ' Questions or privacy requests: ' + CONFIG.REPLY_TO + '.'; }
  if (type === 'fu' && reg['Consent Follow-up'] === 'Yes' && reg['Registration ID'] !== 'FOF-L02-00000') {
    const url = ScriptApp.getService().getUrl() + '?action=unsubscribe&id=' + encodeURIComponent(reg['Registration ID']) + '&t=' + unsubToken_(reg['Registration ID'], String(reg['Email']).toLowerCase());
    foot += ' <a href="' + esc_(url) + '" style="color:#D9B87A">Unsubscribe from future communications</a>.';
    footText += ' Unsubscribe: ' + url;
  }

  return { subject: subject, html: layout_(CONFIG.EPISODE, pre, body, cta, foot), text: text + '\n--\n' + footText + '\n' };
}

function layout_(episode, preheader, body, cta, foot) {
  const btn = cta ? '<p style="margin:8px 0 0"><a href="' + esc_(cta[1]) + '" style="display:inline-block;background:#C41E3A;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:2px">' + esc_(cta[0]) + '</a></p>' : '';
  return '<!doctype html><html><body style="margin:0;padding:0;background:#ECE5D6">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc_(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ECE5D6"><tr><td align="center" style="padding:20px 10px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#F7F4EC;font-family:Arial,Helvetica,sans-serif;color:#14181F;font-size:16px;line-height:1.55">' +
    '<tr><td style="background:#0A0A0B;padding:28px 28px 22px;border-bottom:4px solid #C41E3A">' +
    '<div style="font-family:Georgia,serif;color:#D9B87A;font-size:13px;letter-spacing:1px">' + esc_(CONFIG.SERIES.toUpperCase()) + '</div>' +
    '<div style="font-family:Georgia,serif;color:#F4F0E4;font-size:24px;line-height:1.2;margin-top:8px">' + esc_(episode) + '</div>' +
    '<div style="font-family:Georgia,serif;color:#D6CFC2;font-size:15px;margin-top:6px">Who Pays, Who Profits, and Where Does Nigeria Fit?</div></td></tr>' +
    '<tr><td style="padding:28px">' + body + btn + '</td></tr>' +
    '<tr><td style="background:#0A0A0B;padding:18px 28px;color:#AFA79C;font-size:12px;line-height:1.5">' + foot + '<br><span style="color:#D9B87A;letter-spacing:2px">IDEAS · INSIGHTS · IMPACT</span></td></tr>' +
    '</table></td></tr></table></body></html>';
}

/* ============================== HELPERS ============================== */
function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, sh.getMaxRows() - 1, headers.length).setNumberFormat('@'); // keep values as text
  }
  return sh;
}
function colMap_(sheet) {
  const h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0], m = {};
  h.forEach((n, i) => { m[n] = i + 1; });
  return m;
}
function readRow_(sheet, r) {
  const h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const v = sheet.getRange(r, 1, 1, h.length).getDisplayValues()[0], o = {};
  h.forEach((n, i) => { o[n] = v[i]; });
  return o;
}
function setStatus_(sheet, r, header, value) {
  sheet.getRange(r, colMap_(sheet)[header]).setValue(value);
}
function findRow_(sheet, id, email) {
  const r = findRowById_(sheet, id);
  if (!r) return 0;
  return String(readRow_(sheet, r)['Email']).toLowerCase() === email ? r : 0;
}
function findRowById_(sheet, id) {
  if (!id) return 0;
  const last = sheet.getLastRow(); if (last < 2) return 0;
  const c = colMap_(sheet)['Registration ID'];
  const ids = sheet.getRange(2, c, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}
function nextId_() { // call only while holding the script lock
  const p = PropertiesService.getScriptProperties();
  const n = Number(p.getProperty('REG_SEQ') || '0') + 1;
  p.setProperty('REG_SEQ', String(n));
  return CONFIG.ID_PREFIX + ('00000' + n).slice(-5);
}
function nowText_() { return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function clean_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return s;
}
function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function logError_(where, err, ctx) {
  try {
    getSheet_(CONFIG.SHEETS.ERR, ERR_HEADERS).appendRow([nowText_(), where, String(err && err.message ? err.message : err).slice(0, 300), JSON.stringify(ctx || {}).slice(0, 300)]);
  } catch (e) { console.error(where, err); }
}
