import { IsEmail, IsNotEmpty } from 'class-validator';

export default class RequestAccountDeletionDTO {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
