
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

interface EmailPayload {
  to: string;
  cc?: string;
  subject: string;
  textBody: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as EmailPayload;
    const { to, cc, subject, textBody } = payload;

    if (!to || !subject || !textBody) {
      return NextResponse.json({ message: 'Missing required email fields (to, subject, textBody)' }, { status: 400 });
    }

    // --- Gmail Configuration ---
    // IMPORTANT:
    // 1. Store your Gmail email and an "App Password" (if using 2-Step Verification)
    //    in environment variables. DO NOT hardcode them here.
    // 2. Create a .env.local file in your project root (and add it to .gitignore):
    //    GMAIL_USER=your-email@gmail.com
    //    GMAIL_APP_PASSWORD=your-generated-16-character-app-password
    // 3. How to generate an App Password: https://support.google.com/accounts/answer/185833

    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailAppPassword) {
      console.warn(
        'WARNING: GMAIL_USER or GMAIL_APP_PASSWORD environment variables not set. ' +
        'Email sending will be SIMULATED. ' +
        'Please set them up in your .env.local file (and ensure it is in .gitignore) for actual email sending via Gmail.'
      );
      // Fallback to simulation if credentials are not set
      console.log('--- SIMULATING Email Sending (Gmail Credentials Missing on Server) ---');
      console.log('To:', to);
      if (cc) console.log('CC:', cc);
      console.log('Subject:', subject);
      console.log('Body:\n', textBody);
      console.log('--- Email Sent (Simulated - Gmail Credentials Missing) ---');
      return NextResponse.json({ message: 'Email processed (simulated - Gmail credentials not configured on server)' }, { status: 200 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword, // Use the App Password here
      },
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"DC Converter Tester" <${gmailUser}>`, // Sender address (must be your Gmail address)
      to: to,
      cc: cc,
      subject: subject,
      text: textBody,
      // html: "<b>Hello world?</b>", // You can also send an HTML body if needed
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Message sent via Gmail: %s', info.messageId);
      return NextResponse.json({ message: `Email successfully sent to ${to} via Gmail. Message ID: ${info.messageId}` }, { status: 200 });
    } catch (emailError) {
      console.error('Error sending email via Gmail:', emailError);
      let detailedErrorMessage = 'Failed to send email via Gmail.';
      // @ts-ignore
      if (emailError?.code === 'EAUTH' || emailError?.responseCode === 535 || (emailError?.response?.includes && emailError.response.includes('Username and Password not accepted'))) {
        detailedErrorMessage = 'Gmail authentication failed. Please check your GMAIL_USER and GMAIL_APP_PASSWORD environment variables. Ensure you are using an App Password if 2-Step Verification is enabled for your Gmail account. Also, verify that the App Password is correct and has not been revoked.';
      // @ts-ignore
      } else if (emailError?.code === 'ECONNECTION' || emailError?.code === 'ETIMEDOUT') {
        detailedErrorMessage = 'Failed to connect to Gmail SMTP server. Check your internet connection.';
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
