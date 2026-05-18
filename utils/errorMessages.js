/**
 * @name errorMessages
 * @description This file contains all the error messages used in the application
 */
const errorMessages = {
    EMAIL_USERNAME_PASSWORD_REQUIRED: "Email, Username and Password are required !",
    USERNAME_AND_PASSWORD_REQUIRED: "username and password are required !",
    PASSWORDS_DO_NOT_MATCH: "Passwords do not match !",
    PASSWORD_EXPIRED: "Your password has expired, Please update your password !",
    INVALID_PASSWORD: "password must be at least 12 characters long and contain at least one uppercase letter, one lowercase letter, one digit and one special character !",
    INVALID_CREDENTIALS: "Incorrect email or password !",
    CURRENT_PASSWORD_AND_NEW_PASSWORD_REQUIRED: "Current password and new password are required !",

    TOKEN_EXPIRED: "Your session has expired, please log in again!",

    USER_NOT_FOUND: "User not found !",
    USER_ALREADY_EXISTS: "user already exists !",
    USER_BELONGS_TO_TOKEN_NOT_FOUND: "The user belonging to this token does no longer exist.",

    INVALID_TOKEN: "Invalid token. Please log in again !",
    NOT_LOGGED_IN: "You are not logged in! Please log in to get access.",
    NOT_AUTHORIZED: "You are not authorized to perform this action",
    ACCOUNT_LOCKED: "Your account has been locked. Please contact the administrator !",
    ACCOUNT_IS_LOCKED: "Your account is locked. Please contact the administrator !",
    ACCOUNT_IS_ACTIVE: "user account is already active !",
    ADMIN_ROLE_NOT_ALLOWED: "Admin role is not allowed !",
    SOMETHING_WENT_WRONG: "Something went wrong. Please try again later !",

    ACCESS_RESTRICTED: "Access restricted !",

    //company
    COMPANY_MISSING_DATA : " name, description, country, logoUrl ,aet,userId is required",
    COMPANY_ALREADY_EXISTS:"Company already exists!",

    //AiModel
    AIModel_MISSING_DATA:"title,category,indications,modality,bodyPart,fda,fdaUrl,endpointUrl,metricsUrl,cover,\n" +
        "        deliveryTime,desc,price,subscription,payPerClick,revisionNumber,sales,starFrequency,\n" +
        "        totalStars,userId Is required",
    AI_ALREADY_EXISTS:"Ai model already exists!",


    // review
    REVIEW_NOT_FOUND: "Review not found !",
    ONLY_CUSTOMERS_CAN_CREATE_REVIEW: "Only client can create review !",
    ONLY_ONE_REVIEW_PER_MODEL: "Only one review per model is allowed !",

    // order
    ORDER_NOT_FOUND: "Order not found !",
    ONLY_CUSTOMERS_CAN_CREATE_ORDER: "Only client can create order !",
    AI_MODEL_NOT_FOUND: "Ai model not found !",
    PAYMENT_ERROR: "Payment error !",
    ORDER_ALREADY_CONFIRMED: "Order is already confirmed !",

    //Modules
    MODULES_MISSING_DATA:"Name or Settings",

    MODULES_EXISTS:"Modules already exists!",

    //Rules
    RULES_MISSING_DATA:" rule, name, target,\n" +
        "        disabled,\n" +
        "        fallback,\n" +
        "        contact,\n" +
        "        comment,\n" +
        "        tags,\n" +
        "        study_trigger_series,\n" +
        "        processing_module,\n" +
        "        processing_settings,\n" +
        "        processing_retain_images,\n" +
        "        notification_email,\n" +
        "        notification_webhook,\n" +
        "        notification_payload,\n" +
        "        notification_payload_body,\n" +
        "        notification_email_body,\n" +
        "        notification_email_type,\n" +
        "        notification_trigger_reception,\n" +
        "        notification_trigger_completion,\n" +
        "        notification_trigger_completion_on_request,\n" +
        "        notification_trigger_error",
    RULES_ALREADY_EXISTS:"Rule already exists!",
};


module.exports = errorMessages;
