import {
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { FileRepository } from '../../persistence/file.repository';
import { FileType } from '../../../domain/file';
import { AllConfigType } from '../../../../config/config.type';

@Injectable()
export class FilesCloudinaryService {
  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly fileRepository: FileRepository,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get('file.cloudinaryCloudName', {
        infer: true,
      }),
      api_key: this.configService.get('file.cloudinaryApiKey', {
        infer: true,
      }),
      api_secret: this.configService.get('file.cloudinaryApiSecret', {
        infer: true,
      }),
    });
  }

  async create(file: Express.Multer.File): Promise<{ file: FileType }> {
    if (!file) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          file: 'selectFile',
        },
      });
    }

    const uploadResult = await new Promise<UploadApiResponse>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'restaurant',
            resource_type: 'auto',
          },
          (error, result) => {
            if (error) return reject(error);
            if (!result) {
              return reject(
                new Error('Cloudinary upload returned empty response'),
              );
            }
            resolve(result);
          },
        );
        uploadStream.end(file.buffer);
      },
    );

    return {
      file: await this.fileRepository.create({
        path: uploadResult.secure_url,
      }),
    };
  }
}
