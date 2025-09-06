import fs from 'fs';
import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';


export default function handler( req: NextApiRequest,
  res: NextApiResponse) {
  const filePath = path.join(process.cwd(), 'public', 'privacy-policy.html');
  const data = fs.readFileSync(filePath, 'utf-8');
  res.status(200).send(data);
}
