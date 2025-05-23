import requests

url = "https://api.bavest.co/v0/status"

headers = {"accept": "application/json"}

response = requests.get(url, headers=headers)

print(response.text)