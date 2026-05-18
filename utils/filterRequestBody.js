const filterRequestObject = (obj, ...notAllowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach(el => {
        if (!notAllowedFields.includes(el)) {
            newObj[el] = obj[el];
        }
    });
    return newObj;
};

module.exports = filterRequestObject;
