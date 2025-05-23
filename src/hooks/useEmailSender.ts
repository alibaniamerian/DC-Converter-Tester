// src/hooks/useEmailSender.ts
import { useState } from 'react';

interface UseEmailSenderProps {
  deviceModel: string;
  nominalPower: string;
  viMin: string;
  viMax: string;
  voNominal: string;
}

interface EmailSendResult {
  success: boolean;
  message: string;
}

export const useEmailSender = ({
  deviceModel,
  nominalPower,
  viMin,
  viMax,
  voNominal,
}: UseEmailSenderProps) => {
  const [showUserInfoForm, setShowUserInfoForm] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState(''); 
  const [userCompany, setUserCompany] = useState('');
  const [userIndustry, setUserIndustry] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [plotPictureBase64, setPlotPictureBase64] = useState<string | null>(null);

  const handleShowUserInfoForm = (plotDataBase64: string) => {
    setPlotPictureBase64(plotDataBase64);
    setShowUserInfoForm(true);
  };

  const handleSendEmail = async (): Promise<EmailSendResult> => {
    if (!userName || !userEmail) {
      return { success: false, message: 'Please fill in mandatory fields: Name and Email.' };
    }
    if (!plotPictureBase64) {
        return { success: false, message: 'Plot picture data is missing.'};
    }

    setIsSendingEmail(true);

    const subject = `Data Submission: ${deviceModel} from ${userName}`;
    const nominalSpecInfo = `Nominal Power: ${nominalPower}W, Vi Min: ${viMin}V, Vi Max: ${viMax}V, Vo Nominal: ${voNominal}V`;

    let textBody = `User Information:\n`;
    textBody += `Name: ${userName}\n`;
    textBody += `Email: ${userEmail}\n`;
    textBody += `Company: ${userCompany || 'N/A'}\n`;
    textBody += `Industry: ${userIndustry || 'N/A'}\n`;
    textBody += `Phone: ${userPhone || 'N/A'}\n\n`;
    textBody += `Device Information:\n`;
    textBody += `Model: ${deviceModel}\n`;
    textBody += `Nominal Specs: ${nominalSpecInfo}\n\n`;
    textBody += `Plot image is attached.\n`;

    const emailPayload = {
      to: userEmail, 
      cc: 'alibani@gmail.com', 
      subject: subject,
      textBody: textBody,
      plotPictureBase64: plotPictureBase64, 
      userName: userName,
      deviceModel: deviceModel,
    };

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });

      const data = await response.json();

      if (response.ok) {
        setShowUserInfoForm(false);
        setUserName('');
        setUserEmail('');
        setUserCompany('');
        setUserIndustry('');
        setUserPhone('');
        setPlotPictureBase64(null);
        return { success: true, message: data.message || 'Email sent successfully!' };
      } else {
        return { success: false, message: data.message || 'Error sending email.' };
      }
    } catch (error: any) {
      console.error('Failed to send email:', error);
      return { success: false, message: 'An error occurred while trying to send the email.' };
    } finally {
      setIsSendingEmail(false);
    }
  };

  return {
    showUserInfoForm,
    userName, setUserName,
    userEmail, setUserEmail,
    userCompany, setUserCompany,
    userIndustry, setUserIndustry,
    userPhone, setUserPhone,
    isSendingEmail,
    handleShowUserInfoForm,
    handleSendEmail, 
  };
};
