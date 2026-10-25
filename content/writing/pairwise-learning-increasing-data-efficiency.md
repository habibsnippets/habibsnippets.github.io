* teach NN not to just predict the exact answer but also teach it how two samples compare to each other

* makes learning much more data efficient when labeled data is scarce

* dataset might look like this : 

![image](/assets/writing/hand/image.png)

* collapsing to low varince predictions - meaning that the predicted values have less variance as compared to the actual values

* model plays it safe - predicts values near to the center rather than learning the individual differences that actually matter

* *Solution* : instead of asking the model - hwo old is the person ? we ask it "which of these two are older?" 

![image](/assets/writing/pairwise-learning-increasing-data-efficiency/image.png)
