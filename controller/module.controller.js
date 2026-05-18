const asyncErrorCatching = require("../utils/asyncErrorCatching");
const prisma = require("../prisma/prisma");

exports.createModule = asyncErrorCatching(async (req,res)=>{

    const newModule = await prisma.Module.create({
        data: req.body,
    });

    if(newModule){
        res.status(201).json({
            status: "success",
            data: {
                newModule
            }
        });
    }else{
        res.status(424).json({
            status: "failed",
            data: {
                "message":"can't create Module"
            }
        });
    }

});

exports.getAllModules = asyncErrorCatching(async(req,res)=>{
    const modules = await prisma.Module.findMany();
    res.status(200)
        .json({
            status: "success",
            message: "Models retrieved!",
            data: modules
        });
});


exports.deleteModule = asyncErrorCatching(async (req,res)=>{

    const existingModule = await prisma.Module.findUnique({
        where: {
            module_id: parseInt(req.params.id, 10)
        },
    });

    if (!existingModule) {
        throw new Error('Module not found');
    }
    const deletedModule = await prisma.Module.delete({
        where: {
            module_id: parseInt(req.params.id, 10)
        },
    });

    res.status(200)
        .json({
            status: "success",
            message: "Module deleted successfully!"
        });
});

exports.getModule = asyncErrorCatching(async(req,res)=>{
    const existingModule = await prisma.Module.findUnique({
        where: {
            module_id: parseInt(req.params.id, 10)
        },
    });

    if (!existingModule) {
        throw new Error(' Module not found');
    }
    res.status(200)
        .json({
            status: "success",
            message: "Module retrieved successfully!",
            data:existingModule
        });
});


exports.updateModule = asyncErrorCatching(async(req,res)=>{
    const moduleId = parseInt(req.params.id, 10);

    const existingModule = await prisma.Module.findUnique({
        where: {
            module_id: moduleId,
        },
    });

    if (!existingModule) {
        throw new Error('Module not found!');
    }

    const updatedModule = await prisma.Module.update({
        where: {
            module_id: moduleId,
        },
        data: {
            ...req.body,
        },
    });
    res.status(200).json({
        status: 'success',
        message: 'Module updated successfully!',
        data: updatedModule,
    });
});