import nodemailer from "nodemailer";
import formidable from "formidable";
import fs from "fs";

export const config = { api: { bodyParser: false } };

const ALLOWED_MIME = new Set(["application/pdf","image/jpeg","image/png"]);
const asArray = (x) => (Array.isArray(x) ? x : (x ? [x] : []));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    // Parse form
    const form = formidable({
      multiples: true,
      maxFileSize: 15 * 1024 * 1024,
      filter: part => part.mimetype === null || ALLOWED_MIME.has(part.mimetype),
    });
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, flds, fls) => (err ? reject(err) : resolve({ fields: flds, files: fls })));
    });

    // Build email body
    const ordered = ["first_name","last_name","email","phone","ein","business_type","account_type","business_name","address","city","state","zip","country"];
    const lines = [];
    for (const k of ordered) if (fields[k] !== undefined) lines.push(`${k}: ${asArray(fields[k]).join(", ")}`);
    for (const [k, v] of Object.entries(fields)) if (!ordered.includes(k)) lines.push(`${k}: ${asArray(v).join(", ")}`);

    // Attachments
    const attachments = [];
    const attach = (key) => {
      for (const f of asArray(files[key])) {
        if (f?.filepath && f?.originalFilename) {
          attachments.push({
            filename: f.originalFilename,
            content: fs.createReadStream(f.filepath),
            contentType: f.mimetype || undefined
          });
        }
      }
    };
    attach("fein_license");
    attach("tobacco_license");
    attach("state_tax_id");
    attach("gov_id");

    // Brevo SMTP
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,            // smtp-relay.brevo.com
      port: Number(process.env.SMTP_PORT),    // 587
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,          // your Brevo login email
        pass: process.env.SMTP_PASS           // the SMTP key you generated
      }
    });

    const subject = `New Business Registration: ${fields.business_name?.toString() || "Unknown"}`;
    await transporter.sendMail({
      from: `"Business Registration" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: "jiva.health.amazon@gmail.com",
      subject,
      text: `A new business registration was submitted:\n\n${lines.join("\n")}\n`,
      attachments
    });
    
   // After sendMail succeeds…
const getFirst = (v) => Array.isArray(v) ? v[0] : v;
const urlFromField   = getFirst(fields.redirect);
const urlFromQuery   = getFirst(req.query?.redirect);
const redirectRaw    = urlFromField || urlFromQuery;           // accept either hidden field or ?redirect=
const redirect       = redirectRaw ? String(redirectRaw).trim() : "";

// basic safety check: only http/https
const isHttpUrl = /^https?:\/\//i.test(redirect);

if (isHttpUrl) {
  // 303 is better for POST -> GET after success
  res.writeHead(303, { Location: redirect });
  return res.end();
}

// If no redirect provided, fall back for browsers that prefer HTML
if ((req.headers.accept || "").includes("text/html")) {
  res.writeHead(303, { Location: "/" }); // or default thank-you page
  return res.end();
}

// Fallback for API clients/curl
return res.status(200).json({ ok: true });

    
    // fallback for API clients / curl
    return res.status(200).json({ ok: true });
    
  } catch (err) {
    console.error("Register API error:", err);
    return res.status(500).json({ ok:false, error:"Failed to process submission" });
  }
}
