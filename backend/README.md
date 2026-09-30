# Location Backend

1. Create a Firebase service-account JSON key in Firebase Console > Project settings > Service accounts.
2. Set `FIREBASE_SERVICE_ACCOUNT` to its absolute path and set `ALLOWED_ORIGINS` to the URL that serves this app.
3. Install dependencies: `pip install -r requirements.txt`.
4. Start the API: `uvicorn main:app --host 0.0.0.0 --port 8000`.
5. Deploy it over HTTPS, then set `localStorage.setItem('location-api-url', 'https://your-api.example.com')` in the app browser once.

Locations expire after 15 minutes. The browser shares a location only after the owner presses the Location button. A VPN cannot replace browser GPS permission; the browser uses device/network geolocation with user consent.
