
// src/app/api/send-email/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

interface EmailPayload {
  to: string;
  cc?: string;
  subject: string;
  textBody: string;
  plotPictureBase64?: string;
  userName?: string;
  deviceModel?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as EmailPayload;
    const { to, cc, subject, textBody, plotPictureBase64, userName, deviceModel } = payload;

    if (!to || !subject || !textBody) {
      return NextResponse.json({ message: 'Missing required email fields (to, subject, textBody)' }, { status: 400 });
    }

    // Detailed logging for debugging environment variables on the server
    console.log(`[send-email API] Checking environment variables on the SERVER.`);
    console.log(`[send-email API] GMAIL_USER value: "${process.env.GMAIL_USER}" (Type: ${typeof process.env.GMAIL_USER})`);
    // Avoid logging the actual password, just confirm its presence and type
    const gmailAppPasswordExists = !!process.env.GMAIL_APP_PASSWORD;
    console.log(`[send-email API] GMAIL_APP_PASSWORD exists: ${gmailAppPasswordExists} (Type: ${typeof process.env.GMAIL_APP_PASSWORD})`);


    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailAppPassword) {
      console.warn(
        'WARNING: GMAIL_USER or GMAIL_APP_PASSWORD environment variables not set correctly on the SERVER. ' +
        'Email sending will be SIMULATED. ' +
        'If deployed to Firebase, please configure these in your Firebase project settings (e.g., Cloud Run environment variables or Firebase Functions config), as .env files are generally not deployed.'
      );
      console.log('--- SIMULATING Email Sending (Gmail Credentials Missing or Incorrect on Server) ---');
      console.log('To:', to);
      if (cc) console.log('CC:', cc);
      console.log('Subject:', subject);
      console.log('Body:' + String.fromCharCode(10), textBody);
      if (plotPictureBase64) {
        console.log('Plot Picture Data: Received (simulated attachment)');
      }
      console.log('--- Email Sent (Simulated - Gmail Credentials Missing or Incorrect on Server) ---');
      return NextResponse.json({ message: 'Email processed (simulated - Gmail credentials not configured on server)' }, { status: 200 });
    }

    // If credentials are present, attempt real email sending
    console.log(`Attempting to send email via Gmail with configured credentials for user: ${gmailUser}...`);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"DC Converter Tester" <${gmailUser}>`,
      to: to,
      cc: cc,
      subject: subject,
      text: textBody,
      attachments: [],
    };

    if (plotPictureBase64) {
      mailOptions.attachments!.push({
        filename: `${deviceModel || 'plot'}-${userName || 'user'}.png`,
        content: plotPictureBase64.split('base64,')[1],
        encoding: 'base64',
        contentType: 'image/png',
      });
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Message sent via Gmail: %s', info.messageId);
      return NextResponse.json({ message: `Email successfully sent to ${to} via Gmail. Message ID: ${info.messageId}` }, { status: 200 });
    } catch (emailError) {
      console.error('Error sending email via Gmail:', emailError);
      let detailedErrorMessage = 'Failed to send email via Gmail.';
      // @ts-ignore
      if (emailError?.code === 'EAUTH' || emailError?.responseCode === 535 || (emailError?.response?.includes && emailError.response.includes('Username and Password not accepted'))) {
        detailedErrorMessage = 'Gmail authentication failed. Please check your GMAIL_USER and GMAIL_APP_PASSWORD environment variables on the server. Ensure you are using an App Password if 2-Step Verification is enabled for your Gmail account. Also, verify that the App Password is correct and has not been revoked.';
      // @ts-ignore
      } else if (emailError?.code === 'ECONNECTION' || emailError?.code === 'ETIMEDOUT') {
        detailedErrorMessage = 'Failed to connect to Gmail SMTP server. Check your internet connection and server outbound network rules.';
      } else if (emailError instanceof Error) {
        detailedErrorMessage += ` Details: ${emailError.message}`;
      }

      return NextResponse.json({ message: detailedErrorMessage, errorDetails: (emailError instanceof Error ? emailError.message : String(emailError)) }, { status: 500 });
    }

  } catch (error) {
    console.error('Error processing email request in API route:', error);
    let errorMessage = 'Internal server error while processing the email request.';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ message: 'Failed to process email request', error: errorMessage }, { status: 500 });
  }
}
