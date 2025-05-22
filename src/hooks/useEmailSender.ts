// src/hooks/useEmailSender.ts
import { useState } from 'react';
// import html2canvas from 'html2canvas'; // Removed: html2canvas is used in page.tsx, not directly here

interface UseEmailSenderProps {
  deviceModel: string;
  nominalPower: string;
  viMin: string;
  viMax: string;
  voNominal: string;
  // You might need other device info here
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
  const [userEmail, setUserEmail] = useState(''); // This will be the 'to' address
  const [userCompany, setUserCompany] = useState('');
  const [userIndustry, setUserIndustry] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [plotPictureBase64, setPlotPictureBase64] = useState<string | null>(null);

  // Function to show the form and store plot data
  const handleShowUserInfoForm = (plotDataBase64: string) => {
    setPlotPictureBase64(plotDataBase64);
    setShowUserInfoForm(true);
  };

  // Function to send the email
  const handleSendEmail = async () => {
    if (!userName || !userEmail) {
      alert('Please fill in mandatory fields: Name and Email.');
      return;
    }
    if (!plotPictureBase64) {
        alert('Plot picture data is missing.');
        return;
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
      to: userEmail, // Send to the email address provided by the user
      cc: 'alibani@gmail.com', // CC to alibani@gmail.com
      subject: subject,
      textBody: textBody,
      plotPictureBase64: plotPictureBase64, // Pass the base64 image data
      // Include other user/device details if your backend needs them directly
      // in addition to being in the textBody
      userName: userName,
      deviceModel: deviceModel,
      nominalSpecs: nominalSpecInfo, // an example if your API wants it structured
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
        alert('Email sent successfully!');
        // Optionally reset form and hide it
        setShowUserInfoForm(false);
        setUserName('');
        setUserEmail('');
        setUserCompany('');
        setUserIndustry('');
        setUserPhone('');
        setPlotPictureBase64(null); // Clear stored plot data
      } else {
        alert(`Error sending email: ${data.message}`);
      }
    } catch (error: any) {
      console.error('Failed to send email:', error);
      alert('An error occurred while trying to send the email.');
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
    handleShowUserInfoForm, // Function to call from plot capture
    handleSendEmail, // Function for the email button
  };
};
