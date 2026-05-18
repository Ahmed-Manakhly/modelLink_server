const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");
const {isComplexPassword, isPasswordExpired} = require("../utils/passwordChecker");
const bcrypt = require("bcrypt");



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

const upload = multer({ storage: storage })


/****************************************** profile ENDPOINTS ******************************************/

exports.getUser = asyncErrorCatching(async (req, res, next) => {

    const {id} = req.params;
    if(!id){
        console.log('not found')
        return
    }else{
        const user = await prisma.user.findUnique({
            where: {
                id: parseInt(id)
            }
        });
    if (!user)
        return next( new createError(404, errorMessages.USER_NOT_FOUND));
    res.status(200).json({
        status: "success",
        data: {
            user
        },
    });
    }
    
});

//==================================================================================
exports.updateUser = asyncErrorCatching(async (req, res, next) => {
    return upload.single('avatar')(req,res , async()=>{//EDIT-MANAKHLY
        const {id} = req.params;
        const user = await prisma.user.findUnique({
            where: {
                id: parseInt(id)
            }
        });

    
        if (!user)
            return next(createError(404, errorMessages.USER_NOT_FOUND));
        let avatar = req?.file?.filename?req.file.filename:null
        let updatedFields ={updatedAt:new Date()}
        avatar?updatedFields.avatar = avatar : null
        Object.keys(req.query).length !==0 ?updatedFields = {...updatedFields,...req.query}:null
        updatedFields.rule_id ?updatedFields.rule_id = +updatedFields.rule_id :null
        updatedFields.target_id ?updatedFields.target_id = +updatedFields.target_id :null
        updatedFields.module_id ?updatedFields.module_id = +updatedFields.module_id :null
        const {org_phone ,org_username , org_name , org_ipAddress}=updatedFields

        const user2 = await prisma.user.findFirst({
            where: {
                OR: [
                    {org_phone},
                    {org_username},
                    {org_name},
                    {org_ipAddress}
                ],
            }
        });
        if(user2){
            return         res.status(400).json({
                status: "failed",
                message: 'invalid or duplicated data',
            });
        }
    
        const updatedUser = await prisma.user.update({
            where: {
                id: parseInt(id)
            },
            data: {
                ...updatedFields
            }
        });

        res.status(200).json({
            status: "success",
            data: {
                updatedUser
            },
        });
    })

});
//========================================================
exports.changePassword = asyncErrorCatching(async (req, res, next) => {
    const {email ,password , passwordConfirm } = req.body;
    if(!email || !password  || !passwordConfirm){
        return res.status(400).json({
            status: "failed",
            message: 'invalid data',
        });
    }else{
        const exUser = await prisma.user.findUnique({
            where: {
                email
            }
        });
        if (!exUser ){
            return next( new createError(404, errorMessages.USER_NOT_FOUND));
        }else if(password !== passwordConfirm){
            res.status(400).json({
                status: "failed",
                message: 'invalid data',
            });
        }else if (!isComplexPassword(password)){
            return next(new createError(400, errorMessages.INVALID_PASSWORD));
        }else {
            const newPassword = bcrypt.hashSync(password, 12);
            const updatedUser = await prisma.user.update({
                where: {
                    email
                },
                data: {
                    password : newPassword,
                    password_change : new Date(), 
                    updatedAt: new Date(),
                }
            });
            res.status(200).json({
                status: "success",
                data: {
                    updatedUser
                },
            });
        }
    }
});

