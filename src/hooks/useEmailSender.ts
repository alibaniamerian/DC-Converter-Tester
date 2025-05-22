import { useState } from 'react';
import html2canvas from 'html2canvas'; // Assuming html2canvas is used here or passed in

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
  const [userEmail, setUserEmail] = useState('');
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

    const nominalInfo = `Nominal Power: ${nominalPower}W, Vi Min: ${viMin}V, Vi Max: ${viMax}V, Vo Nominal: ${voNominal}V`;

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: userName,
          email: userEmail,
          company: userCompany,
          industry: userIndustry,
          phone: userPhone,
          deviceModel: deviceModel,
          nominalInfo: nominalInfo,
          plotPicture: plotPictureBase64, // Use the stored base64 data
        }),
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
