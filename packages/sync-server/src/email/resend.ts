import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMagicLink(
  email: string,
  token: string
): Promise<void> {
  const baseUrl = process.env.PUBLIC_URL ?? 'https://sync.vela-browser.com';
  const url = `${baseUrl}/auth/verify?token=${token}`;

  const { error } = await resend.emails.send({
    from: 'Vela Sync <sync@vela-browser.com>',
    to: email,
    subject: 'Accede a Vela Sync',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family:system-ui,sans-serif;
        max-width:480px;margin:0 auto;padding:24px;
        color:#1a1a1a">
        <h2 style="margin-bottom:8px">⚓ Vela Sync</h2>
        <p>Haz click en el enlace para conectar
        este dispositivo a tu cuenta.</p>
        <a href="${url}"
           style="display:inline-block;
             background:#7f77dd;color:#fff;
             padding:12px 24px;border-radius:6px;
             text-decoration:none;font-weight:500;
             margin:16px 0">
          Conectar dispositivo
        </a>
        <p style="color:#888;font-size:13px">
          Este enlace caduca en 15 minutos.<br>
          Si no has solicitado este acceso,
          ignora este email.
        </p>
      </body>
      </html>
    `,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
