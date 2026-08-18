// Standalone Gmail/Workspace SMTP check — run after filling in
// GMAIL_USER/GMAIL_APP_PASSWORD in .env.local, before wiring anything else
// up, so a bad app password shows up here instead of buried in a failed
// voucher submission later.
//
// Usage: npm run email:test -- you@example.com

import nodemailer from "nodemailer";

const recipient = process.argv[2];
if (!recipient) {
  console.error("Usage: npm run email:test -- you@example.com");
  process.exit(1);
}

const user = process.env.GMAIL_USER;
const appPassword = process.env.GMAIL_APP_PASSWORD;
const fromName = process.env.GMAIL_FROM_NAME || "Lub d Voucher System";
const parsedPort = process.env.GMAIL_SMTP_PORT ? Number(process.env.GMAIL_SMTP_PORT) : NaN;
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 587;

if (!user || !appPassword) {
  console.error(
    "GMAIL_USER and/or GMAIL_APP_PASSWORD are not set in .env.local.\n" +
      "Generate an app password: Google Account -> Security -> 2-Step Verification -> App passwords.",
  );
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port,
  secure: port === 465, // 465 = implicit TLS; 587/25 = STARTTLS
  auth: { user, pass: appPassword },
});

try {
  await transporter.verify();
  console.log(`SMTP login OK for ${user}. Sending a test email to ${recipient}...`);

  await transporter.sendMail({
    from: `"${fromName}" <${user}>`,
    to: recipient,
    subject: "Lub d Voucher System — test email",
    text: "If you're reading this, Gmail/Workspace SMTP is configured correctly.",
    html: "<p>If you're reading this, Gmail/Workspace SMTP is configured correctly.</p>",
  });

  console.log("Sent. Check the recipient's inbox (and spam folder, for the first send).");
} catch (error) {
  console.error("SMTP check failed:", error instanceof Error ? error.message : error);
  console.error(
    "\nCommon causes: 2-Step Verification isn't enabled on the account, the app password " +
      "was mistyped/regenerated, or GMAIL_USER doesn't match the account the app password belongs to.",
  );
  process.exit(1);
}
