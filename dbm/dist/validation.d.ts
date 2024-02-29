import { Post } from './posts.js';
declare const Validate: {
    validationConfigDir: string;
    post: (inp: Post) => void;
    file: () => void;
    filechunk: () => void;
};
export default Validate;
