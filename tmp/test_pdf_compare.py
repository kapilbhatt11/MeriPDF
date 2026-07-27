import fitz
import requests

# 1. Create Modified PDF
doc = fitz.open()
page = doc.new_page()
page.insert_text((50, 100), 'Confidential Bill Info:', fontsize=18)
page.insert_text((50, 150), 'Client Email: john.smith@example.com', fontsize=12) # modified
page.insert_text((50, 180), 'Phone Number: +1 555-019-2834', fontsize=12) # same
page.insert_text((50, 210), 'Billing Total Amount: $790.00', fontsize=12) # modified
page.insert_text((50, 240), 'Visa Card Number: 4111 1111 1111 1111', fontsize=12) # same
# SSN page text was deleted
doc.save('test_redact_modified.pdf')
doc.close()

# 2. Query target backend compare endpoint
files = {
    'file_a': ('test_redact.pdf', open('test_redact.pdf', 'rb'), 'application/pdf'),
    'file_b': ('test_redact_modified.pdf', open('test_redact_modified.pdf', 'rb'), 'application/pdf')
}
r = requests.post('http://localhost:8000/pdf/compare', files=files)
assert r.status_code == 200, f'Status is {r.status_code}'
data = r.json()
print('COMPARE TEST SUCCESS!')
print(f'Total Pages compared: {len(data["pages"])}')
print(f'Modified Pages count: {data["modifiedPagesCount"]}')
print(f'Total change entries: {data["totalChangesCount"]}')
