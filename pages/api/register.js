import nodemailer from "nodemailer";
import formidable from "formidable";
import fs from "fs";

export const config = { api: { bodyParser: false } };

const ALLOWED_MIME = new Set(["application/pdf","image/jpeg","image/png"]);
const asArray = (x) => (Array.isArray(x) ? x : (x ? [x] : []));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
  try {
    const form = formidable({
      multiples: true,
      maxFileSize: 15 * 1024 * 1024,
      filter: p => p.mimetype === null || ALLOWED_MIME.has(p.mimetype),
    });
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fl) => (err ? reject(err) : resolve({ fields: f, files: fl })));
    });

    const ordered = ["first_name","last_name","email","phone","ein","business_type","account_type","business_name","address","city","state","zip","country"];
    const lines = [];
    for (const k of ordered) if (fields[k] !== undefined) lines.push(`${k}: ${asArray(fields[k]).join(", ")}`);
    for (const [k,v] of Object.entries(fields)) if (!ordered.includes(k)) lines.push(`${k}: ${asArray(v).join(", ")}`);

    const attachments = [];
    const attach = (key) => {
      for (const f of asArray(files[key])) {
        if (f?.filepath && f?.originalFilename) {
          attachments.push({ filename: f.originalFilename, content: fs.createReadStream(f.filepath), contentType: f.mimetype || undefined });
        }
      }
    };
    attach("fein_license"); attach("tobacco_license"); attach("state_tax_id"); attach("gov_id");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_APP_PASSWORD }
    });

    const subject = `New Business Registration: ${fields.business_name?.toString() || "Unknown"}`;
    await transporter.sendMail({
      from: `"Business Registration" <${process.env.MAIL_USER}>`,
      to: "jiva.health.amazon@gmail.com",
      subject,
      text: `A new business registration was submitted:\n\n${lines.join("\n")}\n`,
      attachments
    });

    return res.status(200).json({ ok:true });
  } catch (err) {
    console.error("Register API error:", err);
    return res.status(500).json({ ok:false, error:"Failed to process submission" });
  }
}
