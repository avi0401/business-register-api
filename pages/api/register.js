// pages/api/register.js
import formidable from "formidable";
import nodemailer from "nodemailer";

export const config = {
  api: { bodyParser: false }, // Formidable needs this OFF
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // helper: get first value if Formidable returns arrays
  const first = (v) => (Array.isArray(v) ? v[0] : v);

  try {
    // 1) Parse form
    const form = formidable({ multiples: true /* allow many files */ });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, flds, fls) => (err ? reject(err) : resolve([flds, fls])));
    });

    // 2) Build transporter (Brevo / Sendinblue)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,                 // smtp-relay.brevo.com
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: false,                               // STARTTLS will upgrade
      auth: {
        user: process.env.SMTP_USER,               // 964ebe001@smtp-brevo.com
        pass: process.env.SMTP_PASS,               // Master Password
      },
    });

    // 3) Collect text lines and attachments
    const lines = [
      `First Name: ${first(fields.first_name) || ""}`,
      `Last Name: ${first(fields.last_name) || ""}`,
      `Email: ${first(fields.email) || ""}`,
      `Phone: ${first(fields.phone) || ""}`,
      `Business Name: ${first(fields.business_name) || ""}`,
      `Address: ${first(fields.address) || ""}`,
      `City: ${first(fields.city) || ""}`,
      `State: ${first(fields.state) || ""}`,
      `ZIP: ${first(fields.zip) || ""}`,
      `Country: ${first(fields.country) || ""}`,
      `Business Type: ${first(fields.business_type) || ""}`,
      `Account Type: ${first(fields.account_type) || ""}`,
      `EIN/FEIN: ${first(fields.fein) || ""}`,
    ];

    const toArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);
    const attachments = Object.values(files)
      .flatMap(toArray)
      .map((f) => ({
        filename: f.originalFilename,
        path: f.filepath,
        contentType: f.mimetype,
      }));

    const subject = `New Business Registration: ${first(fields.business_name) || "Unknown"}`;
    const text = `A new business registration was submitted:\n\n${lines.join("\n")}\n`;

    // 4) Send email
    await transporter.sendMail({
      from: `"Business Registration" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: process.env.MAIL_TO || "jiva.health.amazon@gmail.com",
      subject,
      text,
      attachments,
    });

    // 5) Redirect handling (hidden field or ?redirect=)
    const urlFromField = first(fields.redirect);
    const urlFromQuery = first(req.query?.redirect);
    const redirectRaw = (urlFromField || urlFromQuery || "").toString().trim();

    if (/^https?:\/\//i.test(redirectRaw)) {
      res.writeHead(303, { Location: redirectRaw });
      return res.end();
    }

    // If browser expects HTML but no redirect specified, send them home
    if ((req.headers.accept || "").includes("text/html")) {
      res.writeHead(303, { Location: "/" });
      return res.end();
    }

    // 6) API fallback
    return res.status(200).json({ ok: true });
  } catch (err) {
    // CRITICAL: show real reason in Vercel logs + payload
    console.error("Register API error:", {
      message: err?.message,
      code: err?.code,
      response: err?.response,
      command: err?.command,
    });
    return res
      .status(500)
      .json({ ok: false, error: err?.message || "Failed to process submission" });
  }
}
