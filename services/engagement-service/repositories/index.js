// Chooses the database adapter (STORAGE_DRIVER). Business logic only uses these functions.
const { storage } = require('@roadhub/shared');

module.exports = storage.chooseDriver('engagement-service', {
  dynamodb: () => require('./dynamodb')
});
