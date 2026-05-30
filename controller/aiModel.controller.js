const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");
//=======================//EDIT-MANAKHLY
const path = require('path')
const multer  = require('multer')

const storage = multer.diskStorage({
    destination : (req,file,cb)=>{
        cb(null,'public')
    },
    filename :  (req,file,cb)=>{
        cb(null,file.fieldname+"_"+Date.now()+path.extname(file.originalname))
    },
})

// const upload = multer({ dest: 'uploads/' })
const upload = multer({ storage: storage })
//=====================================================================


exports.createAiModel = asyncErrorCatching(async(req,res,next)=>{
    return upload.single('cover')(req,res , async()=>{//EDIT-MANAKHLY
        if(req.file){
            let cover = req.file.filename
            let {title,category,indications,modality,bodyPart,fda,fdaUrl,endpointUrl,metrics,
                deliveryTime,desc,price,subscription,payPerClick,revisionNumber,sales,starFrequency,
                totalStars,userId,feature,imageUrl} = req.query;
        
            if(!title||!category||!indications||!modality||!bodyPart||!fda||!fdaUrl||!desc||!price||!userId){
                // return next(new createError(400,errorMessages.AIModel_MISSING_DATA));              
                return res.status(400)
                .json({
                    status: "failed",
                    message: "not completed data",

                });

            }
            const exModel =  await prisma.AiModel.findUnique({
                where: {
                    fdaUrl,endpointUrl
                },
            })
            if(exModel){
                return res.status(400)
                .json({
                    status: "failed",
                    message: "AI Model already there , make sure fdaUrl & endpointUrl are unique",

                });
            }
            const existingUser = await prisma.User.findUnique({
                where: {
                    id: parseInt(userId, 10),
                },
            });
            if (!existingUser) {
                return res.status(400)
                .json({
                    status: "failed",
                    message: "User not found",

                });
            }
            const newAIModel = await prisma.AiModel.create({
                data:{
                    title,
                    category,
                    indications,
                    modality,
                    bodyPart,
                    fda:fda === 'true'?true:false,
                    fdaUrl,
                    endpointUrl,
                    cover,
                    deliveryTime:+deliveryTime ,
                    desc,
                    price:+price,
                    subscription:subscription === 'true'?true:false,
                    payPerClick:payPerClick === 'true'?true:false,
                    revisionNumber:+revisionNumber,
                    sales:+sales,
                    starFrequency:+starFrequency,
                    totalStars:+totalStars,
                    userId:+userId,
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
        }
        }
    )
});

exports.getAllAiModels = asyncErrorCatching(async (req,res)=>{
    const data = await prisma.AiModel.findMany({});
    const dataCount = data.length;
    //=======================================
    const excludeFields = ['sort','page','payPerClick','subscription','price' , 'deliveryTime','priceRule','deliveryTimeRule']; 
    const queries = {...req.query}  ;
    excludeFields.forEach((ele)=>{ delete queries[ele] })
    let filters = []
    for (const key in queries) {
        filters.push({OR:[
            { [`${key}`]: {startsWith: queries[key],mode: 'insensitive',} },
            { [`${key}`]: { endsWith: queries[key] ,mode: 'insensitive',} },
            { [`${key}`]: { contains: queries[key],mode: 'insensitive',} },
        ]})
    }
    const {payPerClick,subscription,price , deliveryTime,priceRule , deliveryTimeRule} = req.query
    payPerClick ==='yes' ? filters.push({payPerClick : true}): null
    subscription ==='yes' ? filters.push({subscription : true}): null
    if(price&& priceRule){ // lte gte lt gt
        filters.push({price : {[priceRule]:+price}})
    }
    if(deliveryTime&& deliveryTimeRule){ // lte gte lt gt
        filters.push({deliveryTime : {[deliveryTimeRule]:+deliveryTime}})
    }
    //====================================================== count
    const filteredDataCount  = await prisma.AiModel.count({
        where: {
            AND:[
                ... filters
            ]
        }
    });
    //====================================================== paginattion
    const page = +req.query.page || 1;
    const take = 12
    const skip  = ( page - 1) * take
    const nextPage = !((skip + take) >= filteredDataCount)
    if(filteredDataCount > 0 && skip >= filteredDataCount ){
        throw new Error("this page is not found!")
    }
    const numberOfPages =  Math.ceil(filteredDataCount / take) ;
    //======================================================
    const models = await prisma.AiModel.findMany({
        where: {
            AND:[
                ... filters
            ]
        },
        orderBy: {
            updatedAt : 'desc'
        },
        skip,
        take,
    });
    const allModels = await Promise.all( // by manakhly
        models.map(async (model)=>{
            const {userId} = model
            const user = await prisma.user.findUnique({
                where: {
                    id: parseInt(userId)
                }
            });
            const {org_username , avatar , first_name}= user
            const newModel = {...model , userData : {org_username , avatar , first_name}}
            return newModel
        })
    )
    
    res.status(200)
        .json({
            status: "success",
            message: "Models retrieved!",
            page,
            nextPage,
            pageCount : allModels.length,
            filteredDataCount,
            numberOfPages,
            dataCount,
            data: allModels
        });
});
//======================================by manakhly
exports.getUserAiModels = asyncErrorCatching(async (req,res)=>{
    const models = await prisma.AiModel.findMany({
        orderBy: {
            updatedAt : 'desc'
        },
        where: {
            userId: parseInt(req.params.id, 10),
        },
    });
    const allModels = await Promise.all( 
    models.map(async (model)=>{
        const {userId} = model
        const user = await prisma.user.findUnique({
            where: {
                id: parseInt(userId)
            }
        });
        const {org_username , avatar , first_name}= user
        const newModel = {...model , userData : {org_username , avatar , first_name}}
        return newModel
    })
)
    res.status(200)
        .json({
            status: "success",
            message: "Models retrieved!",
            data: allModels
        });
});
// ================================================
exports.deleteAiModel = asyncErrorCatching(async (req,res)=>{

    const existingModel = await prisma.AiModel.findUnique({
        where: {
            id: parseInt(req.params.id, 10),
        },
    });

    if (!existingModel) {
        throw new Error('AI Model not found');
    }else {
        // await prisma.AiModel.delete({//EDIT-MANAKHLY
        //     where: {
        //         id: +req.params.id
        //     },
        // });
        const { id } = req.params;
        await prisma.AiModel.delete({
        where: {
            id: +id,
        },});
        res.status(200)
        .json({
            status: "success",
            message: "AI Model  deleted successfully!"
        });
    }
});

exports.getAiModel  = asyncErrorCatching(async(req,res)=>{
    const existingAiModel = await prisma.AiModel.findUnique({
        where: {
            id: parseInt(req.params.id, 10),
        },
    });

    if (!existingAiModel) {
        throw new Error('AI Model not found');
    }
    const {userId} = existingAiModel
    const user = await prisma.user.findUnique({
        where: {
            id: parseInt(userId)
        }
    });
    const {org_username , avatar ,role  ,country , createdAt,first_name }= user
    const model = {...existingAiModel , userData : {org_username , avatar ,role  ,country , createdAt , first_name }}
    res.status(200)
        .json({
            status: "success",
            message: "AI Model retrieved successfully!",
            data:model
        });
})

exports.updateAiModel = asyncErrorCatching(async (req, res, next) => {
    return upload.single('cover')(req,res , async()=>{   //EDIT-MANAKHLY     
        const modelId = parseInt(req.params.id, 10);
    
        const existingModel = await prisma.AiModel.findUnique({
            where: {
                id: modelId,
            },
        });
    
        if (!existingModel) {
            throw new Error('Model not found!');
        }
        let cover = req?.file?.filename?req.file.filename:null
        let modelData ={updatedAt:new Date()}
        cover?modelData.cover = cover : null
        Object.keys(req.query).length !==0 ?modelData = {...modelData,...req.query}:null
        modelData.deliveryTime ?modelData.deliveryTime = +modelData.deliveryTime :null
        modelData.price ?modelData.price = +modelData.price :null
        modelData.subscription !== null?modelData.subscription = modelData.subscription === 'true'?true:false :null
        modelData.payPerClick !== null ?modelData.payPerClick = modelData.payPerClick === 'true'?true:false :null
        const {fdaUrl ,endpointUrl } =modelData
        if(fdaUrl){
            const exModel1 =  await prisma.AiModel.findMany({
                where: {
                    fdaUrl
                },
            })
    
            if(exModel1.length > 0){
                return res.status(400)
                .json({
                    status: "failed",
                    message: "AI Model already there , make sure fdaUrl & endpointUrl are unique",
                });
            }
        }
        if(endpointUrl){
            const exModel2 =  await prisma.AiModel.findMany({
                where: {
                    endpointUrl
                },
            })
    
            if(exModel2.length > 0){
                return res.status(400)
                .json({
                    status: "failed",
                    message: "AI Model already there , make sure fdaUrl & endpointUrl are unique",
                });
            }
        }
        const updatedModel = await prisma.AiModel.update({
            where: {
                id: modelId,
            },
            data: {
                ...modelData
            },
        });
        res.status(200).json({
            status: 'success',
            message: 'AI Model updated successfully!',
            data: updatedModel,
        });
    })
});












