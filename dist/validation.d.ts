import { Post } from './posts.js';
import { File } from './files.js';
declare const Validate: {
    validationConfigDir: string;
    post: (inp: Post) => void;
    file: (inp: File) => void;
    filechunk: () => void;
};
export default Validate;
