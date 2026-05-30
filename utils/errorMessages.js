/**
 * @name errorMessages
 * @description This file contains all the error messages used in the application
 */
const errorMessages = {
    EMAIL_USERNAME_PASSWORD_REQUIRED: "Email, Username and Password are required !",
    USERNAME_AND_PASSWORD_REQUIRED: "username and password are required !",
    PASSWORDS_DO_NOT_MATCH: "Passwords do not match !",
    PASSWORD_EXPIRED: "Your password has expired, Please update your password !",
    INVALID_PASSWORD: process.env.PASSWORD_COMPLEXITY,
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
    INTERNAL_ROLE_NOT_ALLOWED: "Admin and employee accounts cannot be created through public registration !",
    ROLE_ASSIGNMENT_NOT_ALLOWED: "Role assignment is not allowed for this action !",
    EMAIL_REQUIRED: "Please provide your email !",
    OTP_ALREADY_SENT: "OTP request already sent, please wait before requesting again !",
    EMAIL_SEND_FAILED: "Error sending email, try again later !",
    OTP_FIELDS_REQUIRED: "Please provide your email, password, and OTP !",
    EMAIL_INVALID: "Email is invalid !",
    OTP_EXPIRED: "OTP has expired. Please request it again !",
    OTP_INVALID: "Invalid code. Please check your email and try again !",
    OTP_OR_EMAIL_MISSING: "OTP or email are missing !",
    USER_NOT_FOUND_RETRY: "User not found. Please try again !",
    PROFILE_DATA_REQUIRED: "Please provide your profile data !",
    CANNOT_UPDATE_RESTRICTED_FIELDS: "You cannot update role, account status, or email from this endpoint !",
    CANNOT_UPDATE_EMAIL: "You cannot change the registered email !",
    CANNOT_UPDATE_PASSWORD_FIELDS: "Use the change-password endpoint to update your password !",
    CANNOT_UPDATE_STAFF_USER: "You are not allowed to update this staff account !",
    CANNOT_ASSIGN_STAFF_ROLE: "You cannot assign admin or employee roles from this endpoint !",
    CANNOT_UPDATE_USER_ROLE: "You cannot change this user's role !",
    PASSWORD_CONFIRMATION_REQUIRED: "Please provide password confirmation !",
    INVALID_EMAIL_FORMAT: "Please provide a valid email address !",
    USER_ID_REQUIRED: "Please provide a user id !",
    SESSION_EXPIRED: "Session expired. Please log in again !",
    AUTHENTICATION_FAILED: "Authentication failed !",
    USER_INACTIVE: "User is inactive. Please contact support !",
    PASSWORD_CHANGED_RELOGIN: "Password changed recently. Please log in again !",
    ROLE_CHANGED_RELOGIN: "User role changed. Please log in again !",
    SOMETHING_WENT_WRONG: "Something went wrong. Please try again later !",

    ACCESS_RESTRICTED: "Access restricted !",

    //company
    COMPANY_MISSING_DATA: " name, description, country, logoUrl ,aet,userId is required",
    COMPANY_ALREADY_EXISTS: "Company already exists!",

    //AiModel
    AIModel_MISSING_DATA: "title,category,indications,modality,bodyPart,fda,fdaUrl,endpointUrl,metricsUrl,cover,\n" +
        "        deliveryTime,desc,price,subscription,payPerClick,revisionNumber,sales,starFrequency,\n" +
        "        totalStars,userId Is required",
    AI_ALREADY_EXISTS: "Ai model already exists!",


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
    MODULES_MISSING_DATA: "Name or Settings",

    MODULES_EXISTS: "Modules already exists!",

    //Rules
    RULES_MISSING_DATA: " rule, name, target,\n" +
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
    RULES_ALREADY_EXISTS: "Rule already exists!",
};


module.exports = errorMessages;
