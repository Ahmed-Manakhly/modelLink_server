const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");




function generateId(name) {
    const randomNumber = Math.floor(Math.random() * 1000);
    return `${name}-${randomNumber}`;
}
exports.createCompany = asyncErrorCatching(async (req, res, next)=>{

    let {name,desc,country,logoUrl,aet,userId} = req.body;

    //data validation
    if(!name,!desc,!country,!logoUrl,!aet,!userId){
        return next(new createError(400,errorMessages.COMPANY_MISSING_DATA));
    }



    const customId = generateId(name);
    const newCompany = await prisma.Company.create({
        data:{
            customId:customId,
            name :name,
            desc :desc,
            country :country,
            logoUrl  :logoUrl,
            aet   :   aet,
            ipAddress : "1.2.3.4",
            userId:userId
        }
    });

    res.status(201).json({
        status: "success",
        data: {
            newCompany
        }
    });
});


exports.getCompanies = asyncErrorCatching(async(req,res,next)=>{
        const company = await prisma.Company.findMany();
        res.status(200)
        .json({
            status: "success",
            message: "Companies retrieved!",
            data: company
        });
});


exports.deleteCompany = asyncErrorCatching(async(req,res,next)=>{

            const existingCompany = await prisma.Company.findUnique({
                where: {
                    id: parseInt(req.params.id, 10),
                },
            });

            if (!existingCompany) {
                throw new Error('Company not found');
            }
            const deletedCompany = await prisma.Company.delete({
                where: {
                    id: req.params.id,
                },
            });

        res.status(204).json({
            status: "success",
            data: null
        });

});

exports.getCompany = asyncErrorCatching(async(req,res,next)=>{


    const existingCompany = await prisma.Company.findUnique({
        where: {
            id: parseInt(req.params.id, 10),
        },
    });

    if (!existingCompany) {
        throw new Error('Company not found');
    }
    res.status(200)
        .json({
            status: "success",
            message: "Company retrieved successfully!",
            data:existingCompany
        });

});

exports.updateCompany = asyncErrorCatching(async (req, res, next) => {
    const companyId = parseInt(req.params.id, 10);

    const existingCompany = await prisma.Company.findUnique({
        where: {
            id: companyId,
        },
    });

    if (!existingCompany) {
        throw new Error('Company not found');
    }

    const updatedCompany = await prisma.Company.update({
        where: {
            id: companyId,
        },
        data: {
            ...req.body,
        },
    });
    res.status(200).json({
        status: 'success',
        message: 'Company updated successfully!',
        data: updatedCompany,
    });
});

