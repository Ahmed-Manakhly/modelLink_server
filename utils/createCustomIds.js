const { v4: uuidv4 } = require('uuid');

const prefixes = {
    'CLIENT': 'CL',
    'ADMIN': 'AD',
    'DEVELOPER': 'DV'
};

const createCustomIds = (role) => {
    const prefix = prefixes[role];
    const uuid = uuidv4(); // Generate a UUID
     // Using the first 8 characters of the UUID
    return `${prefix}${uuid.substring(0, 4)}`;
}

module.exports = createCustomIds;
