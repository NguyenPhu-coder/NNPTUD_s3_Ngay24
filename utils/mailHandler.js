const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 25,
  secure: false, // Use true for port 465, false for port 587
  auth: {
    user: "49ae76bb02b22b",
    pass: "3667d9e15469e1",
  },
});

module.exports = {
  sendMail: async (to, url) => {
    const info = await transporter.sendMail({
      from: "Admin@hahah.com",
      to: to,
      subject: "request resetpassword email",
      text: "click vao day de reset", // Plain-text version of the message
      html: "click vao <a href=" + url + ">day</a> de reset", // HTML version of the message
    });

    console.log("Message sent:", info.messageId);
  },
  sendPasswordMail: async (to, username, password) => {
    const info = await transporter.sendMail({
      from: "Admin@hahah.com",
      to: to,
      subject: "Thong tin tai khoan cua ban",
      text: `Xin chao ${username}, mat khau cua ban la: ${password}`,
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; border: 1px solid #ddd; border-radius: 8px; padding: 24px;">
                    <h2 style="color: #333;">Xin chao, ${username}!</h2>
                    <p>Tai khoan cua ban da duoc tao thanh cong tren he thong.</p>
                    <p>Thong tin dang nhap:</p>
                    <ul>
                        <li><strong>Username:</strong> ${username}</li>
                        <li><strong>Mat khau:</strong> <span style="background:#f4f4f4;padding:4px 8px;border-radius:4px;font-family:monospace;">${password}</span></li>
                    </ul>
                    <p style="color:#e74c3c;">Vui long doi mat khau sau khi dang nhap lan dau.</p>
                </div>
            `,
    });
    console.log("Password email sent:", info.messageId);
  },
};
