import urllib.request
import uuid
import json
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

pdf_path = r'C:\Users\game\Downloads\Tài liệu\báo cáo công khai của chính phủ ( real )-20260815T081613Z-1-001\báo cáo công khai của chính phủ ( real )\BC CCHC quý III xã Minh Long.pdf'
with open(pdf_path, 'rb') as f:
    pdf_bytes = f.read()

boundary = '----Boundary' + uuid.uuid4().hex
header = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="my_random_report.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode('utf-8')
footer = f'\r\n--{boundary}--\r\n'.encode('utf-8')
body = header + pdf_bytes + footer

req = urllib.request.Request('http://localhost:3001/api/v1/reports/upload', data=body)
req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')

try:
    res = urllib.request.urlopen(req)
    resp_json = json.loads(res.read().decode('utf-8'))
    print('SUCCESS: Upload status =', resp_json['success'])
    print('Title:', resp_json['data']['metadata']['document_title'])
    print('Domain:', resp_json['data']['metadata']['primary_domain'])
    print('Metrics count:', len(resp_json['data']['level2_details']['metrics']))
except Exception as e:
    print('FAILED:', e)
