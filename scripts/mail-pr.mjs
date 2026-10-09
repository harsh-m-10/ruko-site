// Emails the new sale-dates pull request's link. Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// ALERT_EMAIL_TO, ALERT_EMAIL_FROM, PR_URL; the summary is read from sales-summary.md.
import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';

const port = Number(process.env.SMTP_PORT || 587);
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
const summary = readFileSync('sales-summary.md', 'utf8');
await transport.sendMail({
  from: process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER,
  to: process.env.ALERT_EMAIL_TO,
  subject: 'Ruko: new sale dates to check',
  text: `${summary}\nMerge to publish them to the app: ${process.env.PR_URL}\n`,
});
console.log('mail sent');
