import nodemailer from 'nodemailer';
import 'dotenv/config';

export let transporter = nodemailer.createTransport({
  host: process.env.Email_server,
  port: 587,
  auth: {
    user: process.env.Sender_Email, // Your email id
    pass: process.env.Sender_Pass, // Your password
  },
  tls: {
    rejectUnauthorized: false, // Allow self-signed certificates
  },
});
