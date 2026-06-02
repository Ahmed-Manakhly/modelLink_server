const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");

exports.createRule = asyncErrorCatching(async (req, res,next) => {


    let {
        rule, name, target,
        disabled,
        fallback,
        contact,
        comment,
        tags,
        study_trigger_series,
        processing_module,
        processing_settings,
        processing_retain_images,
        notification_email,
        notification_webhook,
        notification_payload,
        notification_payload_body,
        notification_email_body,
        notification_email_type,
        notification_trigger_reception,
        notification_trigger_completion,
        notification_trigger_completion_on_request,
        notification_trigger_error
    } = req.body;

    // if ( !rule|| !name|| !target||
    //     !disabled||
    //     !fallback||
    //     !contact||
    //     !comment||
    //     !tags||
    //     !study_trigger_series||
    //     !processing_module||
    //     !processing_settings||
    //     !processing_retain_images||
    //     !notification_email||
    //     !notification_webhook||
    //     !notification_payload||
    //     !notification_payload_body||
    //     !notification_email_body||
    //     !notification_email_type||
    //     !notification_trigger_reception||
    //     !notification_trigger_completion||
    //     !notification_trigger_completion_on_request||
    //     !notification_trigger_error) {
    //     return next(new createError(400, errorMessages.RULES_MISSING_DATA));
    // }

    const newRule = await prisma.Rule.create({
        data: req.body,
    });

    if (newRule) {
        res.status(201).json({
            status: "success",
            data: {
                newRule
            }
        });
    } else {
        res.status(424).json({
            status: "failed",
            data: {
                "message": "can't create Rule"
            }
        });
    }

});

exports.getAllRules = asyncErrorCatching(async (req, res) => {
    const Rules = await prisma.Rule.findMany();
    res.status(200)
        .json({
            status: "success",
            message: "Rules retrieved!",
            data: Rules
        });
});


exports.deleteRule = asyncErrorCatching(async (req, res) => {

    const existingRule = await prisma.Rule.findUnique({
        where: {
            rule_id: parseInt(req.params.id, 10)
        },
    });

    if (!existingRule) {
        throw new Error('Rule not found');
    }
    const deletedRule = await prisma.Rule.delete({
        where: {
            rule_id: parseInt(req.params.id, 10)
        },
    });

    res.status(204).json({
        status: "success",
        data: null
    });
});

exports.getRule = asyncErrorCatching(async (req, res) => {
    const existingRule = await prisma.Rule.findUnique({
        where: {
            rule_id: parseInt(req.params.id, 10)
        },
    });

    if (!existingRule) {
        throw new Error(' Rule not found');
    }
    res.status(200)
        .json({
            status: "success",
            message: "Rule retrieved successfully!",
            data: existingRule
        });
});


exports.updateRule = asyncErrorCatching(async (req, res) => {
    const RuleId = parseInt(req.params.id, 10);

    const existingRule = await prisma.Rule.findUnique({
        where: {
            rule_id: RuleId,
        },
    });

    if (!existingRule) {
        throw new Error('Rule not found!');
    }

    const updatedRule = await prisma.Rule.update({
        where: {
            rule_id: RuleId,
        },
        data: {
            ...req.body,
        },
    });
    res.status(200).json({
        status: 'success',
        message: 'Rule updated successfully!',
        data: updatedRule,
    });
});