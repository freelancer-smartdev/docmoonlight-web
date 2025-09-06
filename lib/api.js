export const sendEmail = async (data) =>
  fetch('/api/contact', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
  });

export const sendPartnerEmail = async (data) =>
  fetch('/api/partner', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json',
      Accept: 'application/json',
    },
  });
