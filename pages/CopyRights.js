import { useState, useEffect } from 'react';

function CopyRights() {
  const [html, setHtml] = useState('');

  useEffect(() => {
    async function fetchHtml() {
      const response = await fetch('/api/CopyHandler');
      const data = await response.text();
      setHtml(data);
    }
    fetchHtml();
  }, []);

  if (!html) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <iframe
        srcDoc={html}
        style={{ width: '100%', height: '100vh', border: 'none' }}
      />
    </div>
  );
}

export default CopyRights;
