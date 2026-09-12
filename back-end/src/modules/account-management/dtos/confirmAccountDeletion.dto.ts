import { IsNotEmpty, IsString } from 'class-validator';

export default class ConfirmAccountDeletionDTO {
  @IsNotEmpty()
  @IsString()
  token: string;
}
