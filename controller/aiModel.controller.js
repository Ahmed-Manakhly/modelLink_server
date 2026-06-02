const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");
const { uploadingFiles } = require('../utils/fileUploader');
const { getFiles, parseJSONField } = require('../utils/helpers');
const { publicUserFields } = require('../utils/ApiFeaturesHelpersForUsers');
const { generateModelOptions } = require('../utils/ApiFeaturesHelpersForAiModels');
const ApiFeatures = require('../utils/ApiFeatures');
const logger = require('../utils/logger');

exports.uploadModelFiles = uploadingFiles('models', [
    { name: 'cover', maxCount: 1 }
]);
exports.createAiModel = asyncErrorCatching(async(req,res,next)=>{
    const data = parseJSONField(req.body.data) || {};
    const cover = getFiles(req.files, 'cover')?.[0] || null;
    
    let {title,category,indications,modality,bodyPart,fda,fdaUrl,endpointUrl,metrics,
        deliveryTime,desc,price,subscription,payPerClick,revisionNumber,sales,starFrequency,
        totalStars,userId,feature,imageUrl} = data;

    if(!title||!category||!indications||!modality||!bodyPart||!fda||!fdaUrl||!desc||!price||!userId){
        logger.error('Failed to create AI Model', { error: 'Missing required data', requestId: req.id });
        return next(new createError(400, "not completed data"));
    }

    const exModel = await prisma.AiModel.findFirst({
        where: {
            OR: [
                { fdaUrl: fdaUrl },
                ...(endpointUrl ? [{ endpointUrl: endpointUrl }] : [])
            ]
        }
    });

    if(exModel){
        logger.error('Failed to create AI Model', { error: 'Model already exists', requestId: req.id });
        return next(new createError(400, "The 'fdaUrl' or 'endpointUrl' field must be unique. Please try a different value!"));
    }

    const existingUser = await prisma.User.findUnique({
        where: { id: userId },
    });

    if (!existingUser) {
        logger.error('Failed to create AI Model', { error: 'User not found', requestId: req.id });
        return next(new createError(404, "User not found"));
    }
            const newAIModel = await prisma.AiModel.create({
                data:{
                    title,
                    category,
                    indications,
                    modality,
                    bodyPart,
                    fda:fda === 'true' || fda === true ? true : false,
                    fdaUrl,
                    endpointUrl,
                    cover,
                    deliveryTime:+deliveryTime ,
                    desc,
                    price:+price,
                    subscription:subscription === 'true' || subscription === true ? true : false,
                    payPerClick:payPerClick === 'true' || payPerClick === true ? true : false,
                    revisionNumber:+revisionNumber,
                    sales:+sales,
                    starFrequency:+starFrequency,
                    totalStars:+totalStars,
                    userId:userId,
                    updatedAt:new Date()
                }
            });
        
            //create AI model image and AI model feature if there is a new AI Model created
            if(newAIModel){
                if(imageUrl){
                    const ModelImage = await prisma.AiModelImage.create({
                        data : {
                            imageUrl,
                            aiModelId : newAIModel.id
                        }
                    });
                }
                if(feature){
                    const ModelFeature = await  prisma.AiModelFeature.create({
                        data:{
                            feature,
                            aiModelId : newAIModel.id
                        }
                    });
                }
                if(metrics){
                    const ModelId = newAIModel.id;
                    for(const metric of metrics){
                        const ModelMetrics = await prisma.AiModelMetrics.create({
                            data:{
                                metricsUrl: metric.metricsUrl,
                                value: metric.value,
                                metric: metric.metric,
                                aiModelId : ModelId
                            }
                        });
                    }
        
                }
        
            res.status(201).json({
                status: "success",
                data: {
                    newAIModel
                }
            });
        }
});

exports.getAllAiModels = asyncErrorCatching(async (req,res, next)=>{
    const queryBuilder = new ApiFeatures(prisma.aiModel, req.query, generateModelOptions());
    const { data: models, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to get all ai models', { error, requestId: req.id });
        return next(new createError(400, error));
    }

    res.status(200).json({
        status: "success",
        pagination,
        data: { models }
    });
});

exports.getUserAiModels = asyncErrorCatching(async (req, res, next) => {
    const queryBuilder = new ApiFeatures(prisma.aiModel, { ...req.query, userId: req.params.id }, generateModelOptions());
    const { data: models, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to get user ai models', { error, requestId: req.id });
        return next(new createError(400, error));
    }

    res.status(200).json({
        status: "success",
        pagination,
        data: { models }
    });
});
exports.deleteAiModel = asyncErrorCatching(async (req,res, next)=>{
    const { id } = req.params;
    const existingModel = await prisma.AiModel.findUnique({
        where: { id: parseInt(id, 10) },
    });

    if (!existingModel) {
        logger.error('Failed to delete AI Model', { error: 'Not found', requestId: req.id });
        return next(new createError(404, 'AI Model not found'));
    }

    await prisma.AiModel.delete({
        where: { id: parseInt(id, 10) },
    });
    
    res.status(204).json({
        status: "success",
        data: null
    });
});

exports.getAiModel  = asyncErrorCatching(async(req,res, next)=>{
    const existingAiModel = await prisma.AiModel.findUnique({
        where: { id: parseInt(req.params.id, 10) },
        include: { User: { select: publicUserFields } }
    });

    if (!existingAiModel) {
        logger.error('Failed to get AI Model', { error: 'Not found', requestId: req.id });
        return next(new createError(404, 'AI Model not found'));
    }

    res.status(200).json({
        status: "success",
        data: { model: existingAiModel }
    });
})

exports.updateAiModel = asyncErrorCatching(async (req, res, next) => {
    const modelId = parseInt(req.params.id, 10);

    const existingModel = await prisma.AiModel.findUnique({
        where: { id: modelId },
    });

    if (!existingModel) {
        logger.error('Failed to update AI Model', { error: 'Not found', requestId: req.id });
        return next(new createError(404, 'Model not found!'));
    }

    const data = parseJSONField(req.body.data) || {};
    let cover = getFiles(req.files, 'cover')?.[0] || null;
    let modelData = { updatedAt: new Date() }
    
    if(cover) modelData.cover = cover;
    if(Object.keys(data).length !== 0) modelData = { ...modelData, ...data };
    
    if(modelData.deliveryTime) modelData.deliveryTime = +modelData.deliveryTime;
    if(modelData.price) modelData.price = +modelData.price;
    if(modelData.subscription !== undefined && modelData.subscription !== null) modelData.subscription = modelData.subscription === 'true' || modelData.subscription === true;
    if(modelData.payPerClick !== undefined && modelData.payPerClick !== null) modelData.payPerClick = modelData.payPerClick === 'true' || modelData.payPerClick === true;
    if(modelData.fda !== undefined && modelData.fda !== null) modelData.fda = modelData.fda === 'true' || modelData.fda === true;
    
    const {fdaUrl, endpointUrl} = modelData;
    
    if(fdaUrl){
        const exModel1 = await prisma.AiModel.findFirst({
            where: { fdaUrl, NOT: { id: modelId } },
        })

        if(exModel1){
            return next(new createError(400, "The 'fdaUrl' field must be unique. Please try a different value!"));
        }
    }
    
    if(endpointUrl){
        const exModel2 = await prisma.AiModel.findFirst({
            where: { endpointUrl, NOT: { id: modelId } },
        })

        if(exModel2){
            return next(new createError(400, "The 'endpointUrl' field must be unique. Please try a different value!"));
        }
    }

    const updatedModel = await prisma.AiModel.update({
        where: { id: modelId },
        data: { ...modelData },
    });
    
    res.status(200).json({
        status: 'success',
        message: 'AI Model updated successfully!',
        data: updatedModel,
    });
});

