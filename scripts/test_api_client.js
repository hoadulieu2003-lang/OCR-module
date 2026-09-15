const fs = require('fs');
const path = require('path');

async function testUploadApi() {
  const uploadsDir = path.resolve(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));
  if (files.length === 0) {
    console.log('No PDF file in uploads to test');
    return;
  }

  const testFile = path.join(uploadsDir, files[0]);
  console.log('Testing upload with file:', files[0]);

  const fileBuffer = fs.readFileSync(testFile);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('file', blob, 'test_sample.pdf');

  try {
    const res = await fetch('http://localhost:3001/api/v1/reports/upload', {
      method: 'POST',
      headers: {
        'x-api-key': 'kglvs-secret-key-2026'
      },
      body: formData
    });

    const json = await res.json();
    console.log('API Upload Response Status:', res.status);
    console.log('Success:', json.success);
    console.log('Title:', json.data?.metadata?.document_title);
    console.log('Domain:', json.data?.metadata?.primary_domain);
    console.log('Metrics count:', json.data?.level2_details?.metrics?.length);
    console.log('Execution time ms:', json.meta?.processing_time_ms);
  } catch (err) {
    console.error('API Error:', err);
  }
}

testUploadApi();
