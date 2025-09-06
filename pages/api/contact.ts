import type { NextApiRequest, NextApiResponse } from 'next';
import { transporter } from '../../config/nodemailer';
import 'dotenv/config';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {

  if (req.method === 'POST') {
    try {
      const data = req.body;
       let cc: string[] = [];
    switch (data.type) {
      case 'Technical':
        cc = ['kerofawzy2055@gmail.com'];
        break;
      case 'Payment':
        cc = ['bsoliman@docmoonlight.com'];
        break;
      case 'General inquiries':
        cc = ['mike.broce@gmail.com'];
        break;
      case 'Partnership':
        cc = ['rmorcos@docmoonlight.com' ,'rhann015@gmail.com'];
        break;
    }
      const htmlBody = `
      <h3>${data.name} has sent a contact-us message about ${data.subject}</h3>
      <p>${data.message}</p>
      <p>From Email: ${data.email}</p>`;
      await transporter.sendMail(
        {
          from: 'info@docmoonlight.com',
          to: 'info@docmoonlight.com',
          cc,
          subject: data.type,
          html: htmlBody,
        },
        function (error: any, info: any) {
          if (error) {
            console.log('error' + error);
          } else {
            console.log(`Success Email`);
          }
        }
      );
    } catch (err) {
      console.log('err' + err);
    }
  }
  return res.status(400).json({ message: 'error' });
}
