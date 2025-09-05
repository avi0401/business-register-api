import formidable from "formidable";
import nodemailer from "nodemailer";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false, // Required for formidable
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // 1. Parse form fields + files
    const form = formidable({ multiples: true });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // 2. Setup Brevo SMTP transport
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      auth: {
        user: process.env.MAIL_USER, // e.g. 964ebe001@smtp-brevo.com
        pass: process.env.MAIL_APP_PASSWORD, // Your Brevo master password
      },
    });

    // 3. Collect attachments (licenses, IDs, etc.)
    const attachments = Object.values(files).map((file) => ({
      filename: file.originalFilename,
      path: file.filepath,
      contentType: file.mimetype,
    }));

    // 4. Build email content
    const subject = `New Business Registration: ${fields.business_name || "Unknown"}`;
    const body = `
A new business registration was submitted:

First Name: ${fields.first_name || ""}
Last Name: ${fields.last_name || ""}
Email: ${fields.email || ""}
Phone: ${fields.phone || ""}
Business Name: ${fields.business_name || ""}
Address: ${fields.address || ""}
City: ${fields.city || ""}
State: ${fields.state || ""}
Zip: ${fields.zip || ""}
Country: ${fields.country || ""}
Business Type: ${fields.business_type || ""}
Account Type: ${fields.account_type || ""}
EIN/FEIN: ${fields.fein || ""}
`;

    await transporter.sendMail({
      from: `"Business Registration" <${process.env.MAIL_USER}>`,
      to: "jiva.health.amazon@gmail.com", // Where submissions go
      subject,
      text: body,
      attachments,
    });

    // 5. Redirect if "redirect" field is present
    const redirectUrl = fields.redirect || req.query.redirect;
    if (redirectUrl && /^https?:\/\//i.test(redirectUrl)) {
      res.writeHead(303, { Location: redirectUrl.toString() });
      return res.end();
    }

    // 6. Fallback JSON response
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Register API error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to process submission" });
  }
}
