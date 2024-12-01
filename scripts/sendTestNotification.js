// Usage: node sendTestNotification.js YOUR_EXPO_PUSH_TOKEN
const axios = require('axios');

const EXPO_PUSH_TOKEN = process.argv[2];

if (!EXPO_PUSH_TOKEN) {
  console.error('Please provide your Expo Push Token as an argument');
  process.exit(1);
}

async function sendPushNotification() {
  const message = {
    to: EXPO_PUSH_TOKEN,
    sound: 'default',
    title: 'Test Notification',
    body: 'This is a test notification from ExpHive!',
    data: { someData: 'goes here' },
  };

  try {
    await axios.post('https://exp.host/--/api/v2/push/send', message, {
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
    });
    console.log('Notification sent successfully!');
  } catch (error) {
    console.error('Error sending notification:', error.response?.data || error.message);
  }
}

sendPushNotification();
