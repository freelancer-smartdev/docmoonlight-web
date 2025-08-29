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
      let cc: string[] = ['rmorcos@docmoonlight.com' ,'rhann015@gmail.com'];

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #1a237e;">${data.subject}</h2>
          <p>A new request has been submitted by <strong>${data.fullName}</strong> regarding coverage needs.</p>
          <div style="background-color: #f4f4f4; padding: 20px; border-radius: 8px;">
            <p><strong>Full Name:</strong> ${data.fullName}</p>
            <p><strong>Work Email:</strong> <a href="mailto:${data.workEmail}">${data.workEmail}</a></p>
            <p><strong>Company / Practice:</strong> ${data.company}</p>
            <p><strong>Website:</strong> <a href="${data.website}" target="_blank">${data.website}</a></p>
            <p><strong>Expected number of locations:</strong> ${data.locations}</p>
            <p><strong>Hours of operation:</strong> ${data.hours}</p>
            <p><strong>Desired start date:</strong> ${data.startDate}</p>
            ${data.message ? `<p><strong>Message:</strong></p><p>${data.message}</p>` : ''}
          </div>
        </div>
      `;

      await transporter.sendMail(
        {
          from: 'info@docmoonlight.com',
          to: 'info@docmoonlight.com',
          cc,
          subject: "New Coverage Request Form Submission",
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
